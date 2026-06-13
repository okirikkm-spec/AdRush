package com.adrenrush.web.service;

import com.adrenrush.web.entity.User;
import com.adrenrush.web.enums.RoleEnum;
import com.adrenrush.web.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@RequiredArgsConstructor
public class BanService {

    private final UserRepository userRepository;

    /**
     * Забанен ли пользователь прямо сейчас. Истёкший временный бан снимается автоматически.
     */
    @Transactional
    public boolean isBanned(User user) {
        if (user == null || user.getRole() != RoleEnum.BANNED) {
            return false;
        }
        Instant until = user.getBannedUntil();
        if (until != null && until.isBefore(Instant.now())) {
            // временный бан истёк — снимаем
            user.setRole(RoleEnum.USER);
            user.setBannedUntil(null);
            user.setBanReason(null);
            userRepository.save(user);
            return false;
        }
        return true;
    }
}
