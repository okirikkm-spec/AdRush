package com.adrenrush.web.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/** Список супер-администраторов из конфигурации (moderation.super-admins). */
@Component
public class SuperAdmins {

    private final Set<String> names;

    public SuperAdmins(@Value("${moderation.super-admins:Inori}") String raw) {
        this.names = Arrays.stream(raw.split(","))
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .map(s -> s.toLowerCase(Locale.ROOT))
            .collect(Collectors.toUnmodifiableSet());
    }

    public boolean is(String username) {
        return username != null && names.contains(username.toLowerCase(Locale.ROOT));
    }

    public Set<String> names() {
        return names;
    }
}
