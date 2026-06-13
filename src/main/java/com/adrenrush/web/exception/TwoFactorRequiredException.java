package com.adrenrush.web.exception;

/** Бросается при входе, когда у пользователя включена 2FA, а код не передан/неверен. */
public class TwoFactorRequiredException extends RuntimeException {
    public TwoFactorRequiredException(String message) {
        super(message);
    }
}
