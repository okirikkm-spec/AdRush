package com.adrenrush.web.service;

import com.adrenrush.web.entity.User;
import com.adrenrush.web.enums.RoleEnum;
import com.adrenrush.web.exception.ApiException;
import com.adrenrush.web.exception.TwoFactorRequiredException;
import com.adrenrush.web.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final TotpService totpService;
    private final BanService banService;
    private final SuperAdmins superAdmins;
    private final BCryptPasswordEncoder passwordEncoder;

    public String register(String username, String password, String ip, String fingerprint) {
        if (username == null || username.isBlank()) {
            throw ApiException.badRequest("Введите логин");
        }
        if (password == null || password.length() < 4) {
            throw ApiException.badRequest("Пароль должен содержать не менее 4 символов");
        }
        String login = username.trim();
        if (userRepository.existsByUsername(login)) {
            throw ApiException.conflict("Логин уже занят");
        }

        User user = new User();
        user.setUsername(login);
        user.setDisplayName(login);
        user.setPassword(passwordEncoder.encode(password));
        user.setRole(superAdmins.is(login) ? RoleEnum.ADMIN : RoleEnum.USER);
        user.setRegistrationIp(ip);
        user.setLastIp(ip);
        user.setRegistrationFingerprint(fingerprint);
        user.setLastFingerprint(fingerprint);
        userRepository.save(user);

        return jwtService.generateToken(user.getUsername());
    }

    public String login(String username, String password, String code, String ip, String fingerprint) {
        User user = userRepository.findByUsername(username == null ? "" : username.trim())
            .orElseThrow(() -> ApiException.unauthorized("Неверный логин или пароль"));

        if (!passwordEncoder.matches(password, user.getPassword())) {
            throw ApiException.unauthorized("Неверный логин или пароль");
        }

        // Супер-админ всегда сохраняет роль ADMIN и не может быть заблокирован
        if (superAdmins.is(user.getUsername()) && user.getRole() != RoleEnum.ADMIN) {
            user.setRole(RoleEnum.ADMIN);
            user.setBannedUntil(null);
            user.setBanReason(null);
        }

        if (banService.isBanned(user)) {
            String reason = user.getBanReason() != null ? user.getBanReason() : "нарушение правил";
            String until = user.getBannedUntil() != null
                ? " (до " + user.getBannedUntil() + ")" : " (навсегда)";
            throw ApiException.forbidden("Аккаунт заблокирован" + until + ". Причина: " + reason);
        }

        if (user.isTotpEnabled()) {
            if (code == null || code.isBlank()) {
                throw new TwoFactorRequiredException("Требуется код двухфакторной аутентификации");
            }
            if (!totpService.verifyCode(user.getTotpSecret(), code)) {
                throw new TwoFactorRequiredException("Неверный код аутентификатора");
            }
        }

        user.setLastIp(ip);
        if (fingerprint != null && !fingerprint.isBlank()) {
            user.setLastFingerprint(fingerprint);
            if (user.getRegistrationFingerprint() == null) {
                user.setRegistrationFingerprint(fingerprint);
            }
        }
        userRepository.save(user);

        return jwtService.generateToken(user.getUsername());
    }

    /** Восстановление пароля по коду 2FA (если она была включена). */
    public void recoverPassword(String username, String code, String newPassword) {
        User user = userRepository.findByUsername(username == null ? "" : username.trim())
            .orElseThrow(() -> ApiException.notFound("Пользователь не найден"));

        if (!user.isTotpEnabled()) {
            throw ApiException.badRequest("У аккаунта не включена двухфакторная аутентификация — восстановление недоступно");
        }
        if (!totpService.verifyCode(user.getTotpSecret(), code)) {
            throw ApiException.badRequest("Неверный код аутентификатора");
        }
        if (newPassword == null || newPassword.length() < 4) {
            throw ApiException.badRequest("Пароль должен содержать не менее 4 символов");
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
    }
}
