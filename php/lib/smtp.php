<?php
/* =============================================================
   Minimal SMTP client (no external library needed).
   Supports: EHLO/HELO, optional STARTTLS, optional AUTH LOGIN,
   one sender, one or more recipients. Throws RuntimeException
   with the server's reply when something fails.
   ============================================================= */
declare(strict_types=1);

final class RvSmtp
{
    /** @var resource|null */
    private $fp = null;
    /** @var array */
    private $cfg;
    /** @var string[] */
    private $caps = [];

    public function __construct(array $cfg)
    {
        $this->cfg = $cfg;
    }

    /** $data is the full message (headers + body) with CRLF line endings. */
    public function send(string $from, array $to, string $data): void
    {
        $host = (string)$this->cfg['host'];
        $port = (int)$this->cfg['port'];
        $timeout = (int)($this->cfg['timeout'] ?? 20);
        $verify = !empty($this->cfg['verify_tls']);
        $ctx = stream_context_create(['ssl' => [
            'verify_peer' => $verify,
            'verify_peer_name' => $verify,
            'allow_self_signed' => !$verify,
            'peer_name' => $host,
            'SNI_enabled' => true,
        ]]);
        $errno = 0;
        $errstr = '';
        $fp = @stream_socket_client('tcp://' . $host . ':' . $port, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT, $ctx);
        if (!$fp) {
            throw new RuntimeException("Cannot connect to $host:$port ($errno $errstr)");
        }
        $this->fp = $fp;
        stream_set_timeout($fp, $timeout);
        try {
            $this->expect([220]);
            $this->hello();

            $mode = (string)($this->cfg['starttls'] ?? 'auto');
            if ($mode !== 'off' && isset($this->caps['STARTTLS'])) {
                $this->cmd('STARTTLS', [220]);
                $method = STREAM_CRYPTO_METHOD_TLS_CLIENT;
                if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
                    $method |= STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
                }
                if (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT')) {
                    $method |= STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT;
                }
                if (@stream_socket_enable_crypto($fp, true, $method) !== true) {
                    throw new RuntimeException('STARTTLS negotiation failed');
                }
                $this->hello();
            } elseif ($mode === 'required') {
                throw new RuntimeException('Server does not offer STARTTLS');
            }

            $user = (string)($this->cfg['username'] ?? '');
            if ($user !== '') {
                $this->cmd('AUTH LOGIN', [334]);
                $this->cmd(base64_encode($user), [334]);
                $this->cmd(base64_encode((string)($this->cfg['password'] ?? '')), [235]);
            }

            $this->cmd('MAIL FROM:<' . $from . '>', [250]);
            foreach ($to as $rcpt) {
                $this->cmd('RCPT TO:<' . $rcpt . '>', [250, 251]);
            }
            $this->cmd('DATA', [354]);

            // Normalise line endings and dot-stuff lines that start with "." (RFC 5321 4.5.2)
            $data = preg_replace("/\r\n|\r|\n/", "\r\n", $data);
            $data = preg_replace('/^\./m', '..', $data);
            $this->write($data . "\r\n.\r\n");
            $this->expect([250]);
            try {
                $this->cmd('QUIT', [221]);
            } catch (RuntimeException $e) {
                // The message is already accepted; a failed QUIT does not matter.
            }
        } finally {
            fclose($fp);
            $this->fp = null;
        }
    }

    private function hello(): void
    {
        $helo = (string)($this->cfg['helo'] ?? '');
        if ($helo === '') {
            $helo = gethostname() ?: 'localhost';
        }
        $helo = preg_replace('/[^A-Za-z0-9.\-]/', '', $helo) ?: 'localhost';
        $this->write("EHLO $helo\r\n");
        [$code, $lines] = $this->read();
        if ($code !== 250) {
            $this->cmd("HELO $helo", [250]);
            $this->caps = [];
            return;
        }
        $this->caps = [];
        foreach (array_slice($lines, 1) as $line) {
            $word = strtoupper(strtok(substr($line, 4), ' ') ?: '');
            if ($word !== '') {
                $this->caps[$word] = true;
            }
        }
    }

    private function cmd(string $line, array $ok): void
    {
        $this->write($line . "\r\n");
        $this->expect($ok, preg_match('/^[A-Za-z0-9+\/=]{8,}$/', $line) ? '(credentials)' : $line);
    }

    private function expect(array $ok, string $what = 'greeting'): void
    {
        [$code, $lines] = $this->read();
        if (!in_array($code, $ok, true)) {
            throw new RuntimeException("SMTP $what: unexpected reply: " . implode(' | ', $lines));
        }
    }

    /** @return array{0:int,1:string[]} */
    private function read(): array
    {
        $lines = [];
        while (true) {
            $line = fgets($this->fp, 1024);
            if ($line === false) {
                $meta = stream_get_meta_data($this->fp);
                throw new RuntimeException(!empty($meta['timed_out']) ? 'SMTP timeout' : 'SMTP connection closed');
            }
            $line = rtrim($line, "\r\n");
            $lines[] = $line;
            if (strlen($line) < 4 || $line[3] !== '-') {
                break;
            }
        }
        return [(int)substr($lines[count($lines) - 1], 0, 3), $lines];
    }

    private function write(string $s): void
    {
        $len = strlen($s);
        for ($done = 0; $done < $len; $done += $n) {
            $n = fwrite($this->fp, substr($s, $done, 8192));
            if ($n === false || $n === 0) {
                throw new RuntimeException('SMTP write failed');
            }
        }
    }
}
