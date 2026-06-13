package com.adrenrush.web.service;

import com.adrenrush.web.entity.User;
import com.adrenrush.web.enums.RoleEnum;
import com.adrenrush.web.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class DataInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

    private final UserRepository userRepository;
    private final BCryptPasswordEncoder passwordEncoder;
    private final DrinkService drinkService;
    private final ParserService parserService;
    private final SuperAdmins superAdmins;

    @Value("${admin.username:admin}")
    private String adminUsername;

    @Value("${admin.password:admin123}")
    private String adminPassword;

    @Value("${parser.enabled:true}")
    private boolean parserEnabled;

    @Override
    public void run(ApplicationArguments args) {
        ensureAdmin();
        promoteSuperAdmins();
        firstRunParse();
    }

    /** Назначает роль ADMIN существующим супер-администраторам (например, Inori). */
    private void promoteSuperAdmins() {
        for (User u : userRepository.findAll()) {
            if (superAdmins.is(u.getUsername()) && u.getRole() != RoleEnum.ADMIN) {
                u.setRole(RoleEnum.ADMIN);
                u.setBannedUntil(null);
                u.setBanReason(null);
                userRepository.save(u);
                log.info("Супер-админ '{}' получил роль ADMIN", u.getUsername());
            }
        }
    }

    private void ensureAdmin() {
        if (userRepository.existsByRole(RoleEnum.ADMIN)) {
            return;
        }
        if (userRepository.existsByUsername(adminUsername)) {
            User existing = userRepository.findByUsername(adminUsername).orElseThrow();
            existing.setRole(RoleEnum.ADMIN);
            userRepository.save(existing);
            log.info("Пользователю '{}' выдана роль ADMIN", adminUsername);
            return;
        }
        User admin = new User();
        admin.setUsername(adminUsername);
        admin.setDisplayName("Администратор");
        admin.setPassword(passwordEncoder.encode(adminPassword));
        admin.setRole(RoleEnum.ADMIN);
        userRepository.save(admin);
        log.info("Создан администратор по умолчанию: логин '{}' (смените пароль!)", adminUsername);
    }

    private void firstRunParse() {
        if (!parserEnabled) return;
        if (drinkService.count() > 0) return;
        log.info("База энергетиков пуста — выполняем полный первичный парсинг каталога");
        new Thread(() -> {
            int created = parserService.parse(true);
            log.info("Первичный парсинг завершён: создано {} энергетиков", created);
        }, "initial-parser").start();
    }
}
