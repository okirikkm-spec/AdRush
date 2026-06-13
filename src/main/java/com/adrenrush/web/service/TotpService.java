package com.adrenrush.web.service;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Двухфакторная аутентификация по TOTP (RFC 6238), совместимая с Google
 * Authenticator / Authy и т.п. Алгоритм реализован вручную, без внешних
 * библиотек, кроме ZXing для генерации QR-кода.
 */
@Service
public class TotpService {

    private static final String ISSUER = "AdrenRush";
    private static final int DIGITS = 6;
    private static final int PERIOD = 30;          // секунд
    private static final int WINDOW = 1;           // допуск ±1 шаг
    private static final String BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    private final SecureRandom random = new SecureRandom();

    /** Генерирует новый секрет (Base32, 160 бит). */
    public String generateSecret() {
        byte[] bytes = new byte[20];
        random.nextBytes(bytes);
        return base32Encode(bytes);
    }

    /** otpauth://-ссылка для привязки в приложении-аутентификаторе. */
    public String buildOtpAuthUrl(String username, String secret) {
        String label = URLEncoder.encode(ISSUER + ":" + username, StandardCharsets.UTF_8);
        String issuer = URLEncoder.encode(ISSUER, StandardCharsets.UTF_8);
        return "otpauth://totp/" + label
            + "?secret=" + secret
            + "&issuer=" + issuer
            + "&algorithm=SHA1&digits=" + DIGITS + "&period=" + PERIOD;
    }

    /** QR-код для otpauth-ссылки в виде data:image/png;base64,... */
    public String buildQrDataUrl(String otpAuthUrl) {
        try {
            QRCodeWriter writer = new QRCodeWriter();
            BitMatrix matrix = writer.encode(otpAuthUrl, BarcodeFormat.QR_CODE, 240, 240);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", out);
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(out.toByteArray());
        } catch (Exception e) {
            throw new RuntimeException("Не удалось сгенерировать QR-код", e);
        }
    }

    /** Проверяет код с допуском по времени. */
    public boolean verifyCode(String secret, String code) {
        if (secret == null || code == null) return false;
        String normalized = code.trim().replaceAll("\\s", "");
        if (!normalized.matches("\\d{" + DIGITS + "}")) return false;

        byte[] key = base32Decode(secret);
        long step = System.currentTimeMillis() / 1000L / PERIOD;
        for (int i = -WINDOW; i <= WINDOW; i++) {
            if (generateCode(key, step + i).equals(normalized)) {
                return true;
            }
        }
        return false;
    }

    private String generateCode(byte[] key, long counter) {
        byte[] data = new byte[8];
        long value = counter;
        for (int i = 7; i >= 0; i--) {
            data[i] = (byte) (value & 0xff);
            value >>= 8;
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(key, "HmacSHA1"));
            byte[] hash = mac.doFinal(data);
            int offset = hash[hash.length - 1] & 0xf;
            int binary = ((hash[offset] & 0x7f) << 24)
                | ((hash[offset + 1] & 0xff) << 16)
                | ((hash[offset + 2] & 0xff) << 8)
                | (hash[offset + 3] & 0xff);
            int otp = binary % (int) Math.pow(10, DIGITS);
            return String.format("%0" + DIGITS + "d", otp);
        } catch (Exception e) {
            throw new RuntimeException("Ошибка генерации TOTP", e);
        }
    }

    private String base32Encode(byte[] data) {
        StringBuilder sb = new StringBuilder();
        int buffer = 0, bitsLeft = 0;
        for (byte b : data) {
            buffer = (buffer << 8) | (b & 0xff);
            bitsLeft += 8;
            while (bitsLeft >= 5) {
                int index = (buffer >> (bitsLeft - 5)) & 0x1f;
                bitsLeft -= 5;
                sb.append(BASE32.charAt(index));
            }
        }
        if (bitsLeft > 0) {
            int index = (buffer << (5 - bitsLeft)) & 0x1f;
            sb.append(BASE32.charAt(index));
        }
        return sb.toString();
    }

    private byte[] base32Decode(String s) {
        String clean = s.trim().replaceAll("=+$", "").toUpperCase().replaceAll("\\s", "");
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int buffer = 0, bitsLeft = 0;
        for (char c : clean.toCharArray()) {
            int val = BASE32.indexOf(c);
            if (val < 0) continue;
            buffer = (buffer << 5) | val;
            bitsLeft += 5;
            if (bitsLeft >= 8) {
                out.write((buffer >> (bitsLeft - 8)) & 0xff);
                bitsLeft -= 8;
            }
        }
        return out.toByteArray();
    }
}
