<?php
/* =============================================================
   Reviewer application: settings
   This folder (php/lib/) is blocked from the web by
   php/lib/.htaccess, so these values are never served.
   ============================================================= */
declare(strict_types=1);

/* A test setup can point the form at another mail server with the
   RV_SMTP_HOST / RV_SMTP_PORT environment variables. The production
   server sets neither, so the values below are used. */
$rvEnv = function (string $key, string $default): string {
    $v = getenv($key);
    return ($v === false || $v === '') ? $default : $v;
};

return [
    /* --- Mail server ------------------------------------------ */
    'smtp' => [
        'host'       => $rvEnv('RV_SMTP_HOST', 'mail.mtc.edu.om'),
        'port'       => (int)$rvEnv('RV_SMTP_PORT', '25'),
        /* 'auto' = use STARTTLS encryption when the server offers it,
           'off' = never, 'required' = refuse to send without it. */
        'starttls'   => 'auto',
        /* Check the mail server's TLS certificate. Internal relays often
           use a certificate that public checks reject; set to true if
           mail.mtc.edu.om has a valid public certificate. */
        'verify_tls' => false,
        /* Leave empty for an internal relay that needs no login. */
        'username'   => '',
        'password'   => '',
        'timeout'    => 20,
        /* Name this web server gives in the SMTP greeting (EHLO).
           Empty = the server's own host name. */
        'helo'       => '',
    ],

    /* --- Addresses -------------------------------------------- */
    'from_email' => 'no-reply@mtc.edu.om',
    'from_name'  => 'ICEAST 2027 Website',
    'to_email'   => 'iceast@mtc.edu.om',

    /* --- Form limits ------------------------------------------ */
    'max_cv_bytes'     => 5 * 1024 * 1024,   // 5 MB (also shown on the form)
    'min_fill_seconds' => 5,                 // faster than this = a bot
    'token_max_age'    => 6 * 3600,          // an open form stays valid for 6 hours
    'rate_limit'       => ['max' => 5, 'window' => 3600],   // per visitor IP per hour

    /* Secret used to sign the anti-spam token. Set a long random
       string here (e.g. 40+ random characters). If left empty, a
       value derived from this server is used. */
    'token_secret' => '',

    'timezone' => 'Asia/Muscat',

    /* TESTING ONLY: when set to a writable folder, messages are saved
       there as .eml files instead of being sent. Keep '' in production. */
    'capture_dir' => '',
];
