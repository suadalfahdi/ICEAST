<?php
/* =============================================================
   ICEAST 2027 - Reviewer application endpoint
   Called by js/reviewer-form.js from reviewer-application.html.

   GET  ?action=token   -> {"token": "..."}  (signed, time-stamped)
   POST (multipart)     -> {"ok": true, "ref": "RV-..."}
                        or {"ok": false, "message": "...", "fields": {...}}

   The application is emailed through the SMTP relay in
   php/lib/config.php (mail.mtc.edu.om:25, from no-reply@mtc.edu.om
   to iceast@mtc.edu.om) with the CV attached. Nothing is stored
   on the web server except a per-IP counter for rate limiting.
   Requires PHP 7.4 or newer.
   ============================================================= */
declare(strict_types=1);

$CFG = require __DIR__ . '/lib/config.php';
require __DIR__ . '/lib/fields.php';
require __DIR__ . '/lib/smtp.php';

date_default_timezone_set((string)$CFG['timezone']);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

function rv_out(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function rv_secret(array $cfg): string
{
    $s = (string)$cfg['token_secret'];
    return $s !== '' ? $s : hash('sha256', __DIR__ . '|' . php_uname() . '|' . (string)@filemtime(__DIR__ . '/lib/config.php'));
}

function rv_len(string $s): int
{
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s);
}

/** One-line text: valid UTF-8, no control characters, single spaces. */
function rv_clean(string $s, bool $multiline = false): string
{
    if (!preg_match('//u', $s)) {
        $s = function_exists('mb_convert_encoding') ? mb_convert_encoding($s, 'UTF-8', 'UTF-8') : '';
    }
    $s = str_replace(["\r\n", "\r"], "\n", $s);
    $s = $multiline
        ? preg_replace('/[^\P{C}\n\t]/u', '', $s)
        : preg_replace('/\s+/u', ' ', preg_replace('/[^\P{C}\n\t]/u', '', $s));   // line breaks become spaces
    return trim((string)$s);
}

function rv_client_ip(): string
{
    return (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

/* ---------- Token: GET ?action=token ---------- */
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET' && ($_GET['action'] ?? '') === 'token') {
    $ts = (string)time();
    rv_out(200, ['token' => $ts . '.' . hash_hmac('sha256', $ts, rv_secret($CFG))]);
}
if ($method !== 'POST') {
    header('Allow: GET, POST');
    rv_out(405, ['ok' => false, 'message' => 'Method not allowed.']);
}

/* ---------- Same-site request only ---------- */
$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
$host = strtolower(preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? '')));
if ($origin !== '' && strtolower((string)parse_url($origin, PHP_URL_HOST)) !== $host) {
    rv_out(403, ['ok' => false, 'message' => 'This form can only be sent from the ICEAST website.']);
}
if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'XMLHttpRequest') {
    rv_out(400, ['ok' => false, 'message' => 'Please use the form on the ICEAST website.']);
}

/* ---------- Request larger than PHP allows (then $_POST is empty) ---------- */
if (empty($_POST) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    rv_out(413, ['ok' => false, 'message' => 'The upload is too large. Please attach a CV of 5 MB or less.', 'fields' => ['cv' => 'Please attach a CV of 5 MB or less.']]);
}

/* ---------- Honeypot: bots fill the hidden "website" box; pretend success ---------- */
if (trim((string)($_POST['website'] ?? '')) !== '') {
    rv_out(200, ['ok' => true, 'ref' => 'RV-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(3)))]);
}

/* ---------- Token check (signed by us, not too fast, not too old) ---------- */
$token = (string)($_POST['token'] ?? '');
$parts = explode('.', $token, 2);
$age = count($parts) === 2 && ctype_digit($parts[0]) ? time() - (int)$parts[0] : -1;
if (count($parts) !== 2 || !hash_equals(hash_hmac('sha256', $parts[0], rv_secret($CFG)), $parts[1]) || $age > (int)$CFG['token_max_age']) {
    rv_out(400, ['ok' => false, 'expired' => true, 'message' => 'This page was open for a long time, so the form needs refreshing. Please press "Submit Application" again.']);
}
if ($age < (int)$CFG['min_fill_seconds']) {
    rv_out(429, ['ok' => false, 'message' => 'That was very quick. Please wait a few seconds and press "Submit Application" again.']);
}

/* ---------- Rate limit per IP (file counter in the system temp folder) ---------- */
$rateDir = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'iceast-reviewer-rate';
if (!is_dir($rateDir)) {
    @mkdir($rateDir, 0700, true);
}
$rateFile = $rateDir . DIRECTORY_SEPARATOR . hash('sha256', rv_client_ip()) . '.json';
$now = time();
$window = (int)$CFG['rate_limit']['window'];
$hits = [];
if (is_file($rateFile)) {
    $hits = array_values(array_filter((array)json_decode((string)@file_get_contents($rateFile), true), function ($t) use ($now, $window) {
        return is_int($t) && $t > $now - $window;
    }));
}
if (count($hits) >= (int)$CFG['rate_limit']['max']) {
    rv_out(429, ['ok' => false, 'message' => 'Several applications have already been sent from this connection. Please try again later, or contact iceast@mtc.edu.om.']);
}

/* ---------- Validate every field against the whitelist ---------- */
$answers = [];   // name => string|string[] (clean values, as shown in the email)
$errors = [];    // name => message
$others = [];    // name => "Other" text

/** Array of strings posted as name[] (non-strings dropped, duplicates removed). */
function rv_post_list(string $name): array
{
    $raw = $_POST[$name] ?? [];
    $out = [];
    if (is_array($raw)) {
        foreach ($raw as $v) {
            if (is_string($v) && !in_array($v, $out, true)) {
                $out[] = $v;
            }
        }
    }
    return $out;
}
function rv_post_str(string $name): string
{
    $v = $_POST[$name] ?? '';
    return is_string($v) ? $v : '';
}
/** ORCID iD: accepts 0000-0002-1825-0097, 0000000218250097 or an orcid.org link; checks the check digit (ISO 7064 11,2). */
function rv_orcid(string $v): ?string
{
    $v = strtoupper((string)preg_replace('#^(https?://)?(www\.)?orcid\.org/#i', '', trim($v)));
    $d = str_replace('-', '', $v);
    if (!preg_match('/^\d{15}[\dX]$/', $d)) {
        return null;
    }
    $total = 0;
    for ($i = 0; $i < 15; $i++) {
        $total = ($total + (int)$d[$i]) * 2;
    }
    $check = (12 - $total % 11) % 11;
    if (($check === 10 ? 'X' : (string)$check) !== $d[15]) {
        return null;
    }
    return implode('-', str_split($d, 4));
}

foreach (RV_FIELDS as $name => $f) {
    if (isset($f['showif'])) {
        [$depName, $depValue] = $f['showif'];
        if (($answers[$depName] ?? null) !== $depValue) {
            continue;   // question hidden on the form (e.g. "reviewing experience" when the answer before is "No")
        }
    }
    $type = $f['type'];
    $req = (bool)$f['required'];
    switch ($type) {
        case 'file':
            continue 2;   // the CV is handled below

        case 'checkbox':
            $vals = array_values(array_intersect(rv_post_list($name), $f['options']));
            if ($req && !$vals) {
                $errors[$name] = 'Please select at least one option.';
            }
            $answers[$name] = $vals;
            break;

        case 'radio':
            $v = rv_post_str($name);
            $v = in_array($v, $f['options'], true) ? $v : '';
            if ($req && $v === '') {
                $errors[$name] = 'Please choose one option.';
            }
            $answers[$name] = $v;
            break;

        case 'consent':
            $yes = rv_post_str($name) === 'yes';
            if ($req && !$yes) {
                $errors[$name] = $name === 'declaration'
                    ? 'Please confirm the declaration to submit your application.'
                    : 'Please tick this box to submit your application.';
            }
            $answers[$name] = $name === 'consentListing' ? ($yes ? 'Yes' : 'No') : ($yes ? 'Agreed' : 'Not agreed');
            break;

        case 'phone':
            $code = rv_post_str('phoneCode');
            $num = rv_clean(rv_post_str('phoneNumber'));
            $digits = (string)preg_replace('/\D/', '', $num);
            $codeDigits = preg_match('/\(\+(\d{1,4})\)$/', $code, $m) ? $m[1] : '';
            if (!in_array($code, RV_DIAL_CODES, true)) {
                $errors[$name] = 'Please choose a country code.';
            } elseif ($num === '') {
                $errors[$name] = 'Please enter your phone number.';
            } elseif (!preg_match('/^[\d\s().\-]+$/', $num) || strlen($digits) < 4 || strlen($digits) + strlen($codeDigits) > 15) {
                $errors[$name] = 'Please enter a valid phone number (digits only, without the country code).';
            }
            $country = (string)preg_replace('/\s*\(\+\d+\)$/', '', $code);
            $answers[$name] = $num === '' ? '' : '+' . $codeDigits . ' ' . $num . ' (' . $country . ')';
            break;

        case 'keywords':
            $kw = [];
            foreach (rv_post_list($name) as $k) {
                $k = rv_clean($k);
                if ($k !== '' && !in_array(strtolower($k), array_map('strtolower', $kw), true)) {
                    $kw[] = $k;
                }
            }
            if ($req && !$kw) {
                $errors[$name] = 'Please add at least one keyword.';
            } elseif (count($kw) > 5) {
                $errors[$name] = 'Please keep to 5 keywords or fewer.';
            } else {
                foreach ($kw as $k) {
                    if (rv_len($k) > 60) {
                        $errors[$name] = 'Please keep each keyword to 60 characters or fewer.';
                    }
                }
            }
            $answers[$name] = $kw;
            break;

        case 'trackpick':
            // Only the conferences chosen in the question before count.
            $allowed = [];
            foreach ((array)($answers['tracks'] ?? []) as $conf) {
                if (isset(RV_TRACKS[$conf])) {
                    $allowed += RV_TRACKS[$conf];
                }
            }
            if (!$allowed) {
                continue 2;   // hidden on the form (only "Other" chosen)
            }
            $picked = array_values(array_intersect(rv_post_list($name), array_keys($allowed)));
            $topics = rv_post_list('topics');
            if ($req && !$picked) {
                $errors[$name] = 'Please tick at least one track.';
            }
            $lines = [];
            foreach ($picked as $code) {
                $chosen = array_values(array_intersect_key($allowed[$code]['topics'], array_flip($topics)));
                $lines[] = strtok($code, '-') . ': ' . $allowed[$code]['title'] . ($chosen ? "\n   Topics: " . implode('; ', $chosen) : '');
            }
            $answers[$name] = implode("\n", $lines);
            break;

        case 'orcid':
            $v = rv_clean(rv_post_str($name));
            if ($v !== '') {
                $id = rv_orcid($v);
                if ($id === null) {
                    $errors[$name] = 'Please check your ORCID iD: it should be 16 digits, like 0000-0002-1825-0097.';
                } else {
                    $v = 'https://orcid.org/' . $id;
                }
            } elseif ($req) {
                $errors[$name] = 'Please answer this question.';
            }
            $answers[$name] = $v;
            break;

        case 'number':
            $v = trim(rv_post_str($name));
            if ($v === '') {
                if ($req) {
                    $errors[$name] = 'Please answer this question.';
                }
            } elseif (!ctype_digit($v) || (int)$v < (int)($f['min'] ?? 0) || (int)$v > (int)$f['max']) {
                $errors[$name] = 'Please enter a whole number between ' . (int)($f['min'] ?? 0) . ' and ' . (int)$f['max'] . '.';
            } else {
                $v = (string)(int)$v;
            }
            $answers[$name] = $v;
            break;

        default:   // text, textarea, email, url
            $v = rv_clean(rv_post_str($name), $type === 'textarea');
            if ($v === '') {
                if ($req) {
                    $errors[$name] = 'Please answer this question.';
                }
            } elseif (rv_len($v) > (int)$f['max']) {
                $errors[$name] = 'Please shorten this answer to ' . $f['max'] . ' characters or fewer.';
            } elseif ($type === 'email' && !filter_var($v, FILTER_VALIDATE_EMAIL)) {
                $errors[$name] = 'Please enter a valid email address.';
            } elseif ($type === 'url' && (!filter_var($v, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $v))) {
                $errors[$name] = 'Please enter a full web address starting with https://';
            }
            $answers[$name] = $v;
    }

    // "Other" needs its own text
    if (isset($f['other']) && in_array('Other', (array)$answers[$name], true)) {
        $o = rv_clean(rv_post_str($f['other']));
        if ($o === '') {
            $errors[$f['other']] = 'Please specify.';
        } elseif (rv_len($o) > 200) {
            $errors[$f['other']] = 'Please shorten this answer to 200 characters or fewer.';
        }
        $others[$name] = $o;
    }
}

/* ---------- CV ---------- */
$cv = null;
$file = $_FILES['cv'] ?? null;
if (!is_array($file) || !isset($file['error']) || is_array($file['error']) || $file['error'] === UPLOAD_ERR_NO_FILE) {
    $errors['cv'] = 'Please attach your CV (PDF, DOC or DOCX, up to 5 MB).';
} elseif ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE || (int)$file['size'] > (int)$CFG['max_cv_bytes']) {
    $errors['cv'] = 'Please attach a CV of 5 MB or less.';
} elseif ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file((string)$file['tmp_name'])) {
    $errors['cv'] = 'The CV could not be uploaded. Please try again.';
} else {
    $ext = strtolower(pathinfo((string)$file['name'], PATHINFO_EXTENSION));
    $head = (string)file_get_contents((string)$file['tmp_name'], false, null, 0, 8);
    $magic = [
        'pdf'  => strncmp($head, '%PDF-', 5) === 0,
        'doc'  => strncmp($head, "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1", 8) === 0,
        'docx' => strncmp($head, "PK\x03\x04", 4) === 0,
    ];
    $mimes = [
        'pdf'  => 'application/pdf',
        'doc'  => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!isset($magic[$ext])) {
        $errors['cv'] = 'This file type is not accepted. Please upload a PDF, DOC or DOCX file.';
    } elseif (!$magic[$ext] || (int)$file['size'] === 0) {
        $errors['cv'] = 'This file does not look like a valid ' . strtoupper($ext) . ' document. Please check it and upload it again.';
    } else {
        $cv = ['path' => (string)$file['tmp_name'], 'ext' => $ext, 'mime' => $mimes[$ext], 'size' => (int)$file['size'], 'orig' => rv_clean((string)$file['name'])];
    }
}

if ($errors) {
    rv_out(422, ['ok' => false, 'message' => 'Please check the highlighted answers and submit again.', 'fields' => $errors]);
}

/* ---------- Build the email ---------- */
$ref = 'RV-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
$fullName = (string)$answers['fullName'];
$submitted = date('j F Y, H:i') . ' (Muscat time)';

function rv_hdr(string $s): string
{
    $s = str_replace(["\r", "\n"], ' ', $s);
    return preg_match('/[^\x20-\x7E]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
}
function rv_addr(string $name, string $email): string
{
    $name = str_replace(["\r", "\n", '"', '\\'], ' ', $name);
    $enc = rv_hdr($name);
    return ($enc === $name ? '"' . $name . '"' : $enc) . ' <' . str_replace(["\r", "\n", '<', '>'], '', $email) . '>';
}
function rv_answer(string $name, array $answers, array $others): string
{
    $v = $answers[$name] ?? '';
    $list = is_array($v) ? $v : ($v === '' ? [] : [$v]);
    foreach ($list as $i => $item) {
        if ($item === 'Other' && isset($others[$name]) && $others[$name] !== '') {
            $list[$i] = 'Other: ' . $others[$name];
        }
    }
    return implode(is_array($v) && count($list) > 3 ? "\n" : '; ', $list);
}

$rows = [];   // [section, label, value]
foreach (RV_FIELDS as $name => $f) {
    if ($f['type'] !== 'file' && !array_key_exists($name, $answers)) {
        continue;   // question was hidden on the form
    }
    $value = $f['type'] === 'file'
        ? sprintf('%s (%s, %s KB) - attached', $cv['orig'], strtoupper($cv['ext']), number_format($cv['size'] / 1024, 0))
        : rv_answer($name, $answers, $others);
    $rows[] = [$f['section'], $f['label'], $value === '' ? 'Not provided' : $value];
}
$rows[] = [5, 'Date', date('j F Y')];

$text = "ICEAST 2027 - Call for Reviewers\r\nNew reviewer application\r\n\r\nReference: $ref\r\nSubmitted: $submitted\r\n";
$h = function (string $s): string {
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
};
$html = '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#FAF8F0;font-family:Arial,Helvetica,sans-serif;color:#1C1B16">'
    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #E5E2D6;border-top:4px solid #BCA910">'
    . '<tr><td style="padding:22px 26px 8px"><p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#9C8C0D;font-weight:bold">ICEAST 2027 &middot; Call for Reviewers</p>'
    . '<h1 style="margin:6px 0 4px;font-size:22px">New reviewer application</h1>'
    . '<p style="margin:0;color:#55524A;font-size:14px">Reference <b>' . $h($ref) . '</b> &middot; ' . $h($submitted) . '</p></td></tr>';
$section = 0;
foreach ($rows as [$sec, $label, $value]) {
    if ($sec !== $section) {
        $section = $sec;
        $title = 'Section ' . $sec . ': ' . RV_SECTIONS[$sec - 1];
        $text .= "\r\n" . strtoupper($title) . "\r\n" . str_repeat('-', strlen($title)) . "\r\n";
        $html .= '<tr><td style="padding:18px 26px 6px"><h2 style="margin:0;font-size:15px;color:#2F3786;border-bottom:1px solid #E5E2D6;padding-bottom:6px">' . $h($title) . '</h2></td></tr>';
    }
    $text .= $label . ":\r\n  " . str_replace("\n", "\r\n  ", $value) . "\r\n";
    $html .= '<tr><td style="padding:4px 26px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
        . '<td valign="top" style="width:42%;padding:6px 10px 6px 0;font-size:13.5px;color:#807C6F">' . $h($label) . '</td>'
        . '<td valign="top" style="padding:6px 0;font-size:14px;font-weight:bold">' . nl2br($h($value)) . '</td></tr></table></td></tr>';
}
$text .= "\r\nReply to this email to contact the applicant directly.\r\n";
$html .= '<tr><td style="padding:18px 26px 22px;font-size:12.5px;color:#807C6F">Reply to this email to contact the applicant directly. The CV is attached.</td></tr></table></body></html>';

$slug = trim(preg_replace('/[^A-Za-z0-9]+/', '-', $fullName) ?? '', '-');
$attachName = 'CV-' . ($slug !== '' ? $slug : $ref) . '.' . $cv['ext'];
$mixed = 'mix-' . bin2hex(random_bytes(12));
$alt = 'alt-' . bin2hex(random_bytes(12));
$fromDomain = substr(strrchr((string)$CFG['from_email'], '@') ?: '@localhost', 1);

$headers = [
    'Date: ' . date(DATE_RFC2822),
    'From: ' . rv_addr((string)$CFG['from_name'], (string)$CFG['from_email']),
    'To: ' . (string)$CFG['to_email'],
    'Reply-To: ' . rv_addr($fullName, (string)$answers['email']),
    'Subject: ' . rv_hdr('ICEAST 2027 Reviewer Application: ' . $fullName . ' (' . $ref . ')'),
    'Message-ID: <' . strtolower($ref) . '.' . bin2hex(random_bytes(6)) . '@' . $fromDomain . '>',
    'MIME-Version: 1.0',
    'X-Mailer: ICEAST website',
    'Auto-Submitted: auto-generated',
    'Content-Type: multipart/mixed; boundary="' . $mixed . '"',
];
$body = "This is a multi-part message in MIME format.\r\n"
    . "--$mixed\r\nContent-Type: multipart/alternative; boundary=\"$alt\"\r\n\r\n"
    . "--$alt\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n"
    . quoted_printable_encode($text) . "\r\n"
    . "--$alt\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n"
    . quoted_printable_encode($html) . "\r\n"
    . "--$alt--\r\n"
    . "--$mixed\r\nContent-Type: {$cv['mime']}; name=\"$attachName\"\r\nContent-Transfer-Encoding: base64\r\n"
    . "Content-Disposition: attachment; filename=\"$attachName\"\r\n\r\n"
    . rtrim(chunk_split(base64_encode((string)file_get_contents($cv['path'])), 76, "\r\n")) . "\r\n"
    . "--$mixed--\r\n";
$message = implode("\r\n", $headers) . "\r\n\r\n" . $body;

/* ---------- Send (or save, when testing) ---------- */
try {
    $capture = (string)$CFG['capture_dir'];
    if ($capture !== '') {
        if (!is_dir($capture) || file_put_contents(rtrim($capture, '/\\') . DIRECTORY_SEPARATOR . $ref . '.eml', $message) === false) {
            throw new RuntimeException('capture_dir is not writable');
        }
    } else {
        (new RvSmtp($CFG['smtp']))->send((string)$CFG['from_email'], [(string)$CFG['to_email']], $message);
    }
} catch (Throwable $e) {
    error_log('[ICEAST reviewer form] ' . $ref . ' not sent: ' . $e->getMessage());
    rv_out(502, ['ok' => false, 'message' => 'Sorry, your application could not be sent right now. Please try again in a few minutes. If the problem continues, please contact iceast@mtc.edu.om.']);
}

$hits[] = $now;
@file_put_contents($rateFile, json_encode($hits), LOCK_EX);
rv_out(200, ['ok' => true, 'ref' => $ref]);
