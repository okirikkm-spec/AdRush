package com.adrenrush.web.enums;

/** Тип действия модератора, фиксируемого в журнале аудита. */
public enum AuditAction {
    BAN,
    UNBAN,
    DELETE_USER,
    DELETE_REVIEW,
    WARN,
    GRANT_ADMIN,
    REVOKE_ADMIN,
    DRINK_CREATE,
    DRINK_UPDATE,
    DRINK_DELETE
}
