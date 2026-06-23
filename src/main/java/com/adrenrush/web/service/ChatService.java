package com.adrenrush.web.service;

import com.adrenrush.web.dto.*;
import com.adrenrush.web.entity.ChatMessage;
import com.adrenrush.web.entity.Conversation;
import com.adrenrush.web.entity.ConversationMember;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.enums.ConversationType;
import com.adrenrush.web.exception.ApiException;
import com.adrenrush.web.repository.ChatMessageRepository;
import com.adrenrush.web.repository.ConversationMemberRepository;
import com.adrenrush.web.repository.ConversationRepository;
import com.adrenrush.web.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
public class ChatService {

    private static final String QUEUE = "/queue/chat";

    private final ConversationRepository conversationRepo;
    private final ConversationMemberRepository memberRepo;
    private final ChatMessageRepository messageRepo;
    private final UserRepository userRepo;
    private final BanService banService;
    private final SimpMessagingTemplate messagingTemplate;

    /* ─────────────── Чтение ─────────────── */

    @Transactional(readOnly = true)
    public List<ConversationDto> listConversations(User me) {
        return memberRepo.findByUserId(me.getId()).stream()
            .map(m -> buildDto(m.getConversation(), me.getId()))
            .sorted(Comparator.comparing(ConversationDto::getLastMessageAt).reversed())
            .toList();
    }

    @Transactional(readOnly = true)
    public ConversationDto getConversation(Long convId, User me) {
        requireMember(convId, me.getId());
        return buildDto(conversationRepo.findById(convId).orElseThrow(() -> ApiException.notFound("Беседа не найдена")), me.getId());
    }

    @Transactional(readOnly = true)
    public List<ChatMessageDto> listMessages(Long convId, User me, Long beforeId, int limit) {
        requireMember(convId, me.getId());
        var page = PageRequest.of(0, Math.min(Math.max(limit, 1), 100));
        List<ChatMessage> msgs = (beforeId == null)
            ? messageRepo.findByConversationIdOrderByIdDesc(convId, page)
            : messageRepo.findByConversationIdAndIdLessThanOrderByIdDesc(convId, beforeId, page);
        List<ChatMessageDto> dtos = new ArrayList<>(msgs.stream().map(ChatMessageDto::from).toList());
        Collections.reverse(dtos); // по возрастанию (старые сверху)
        return dtos;
    }

    @Transactional(readOnly = true)
    public int totalUnread(User me) {
        return listConversations(me).stream().mapToInt(ConversationDto::getUnreadCount).sum();
    }

    @Transactional(readOnly = true)
    public List<UserBriefDto> searchUsers(User me, String q) {
        if (q == null || q.isBlank()) return List.of();
        String term = q.strip();
        return userRepo.findByUsernameContainingIgnoreCaseOrDisplayNameContainingIgnoreCase(term, term, PageRequest.of(0, 30)).stream()
            .filter(u -> !u.getId().equals(me.getId()))
            .filter(u -> !u.isSystem())
            .filter(u -> !banService.isBanned(u))
            .limit(20)
            .map(UserBriefDto::from)
            .toList();
    }

    /* ─────────────── Создание бесед ─────────────── */

    @Transactional
    public ConversationDto getOrCreateDirect(User me, Long otherId) {
        if (otherId.equals(me.getId())) throw ApiException.badRequest("Нельзя начать чат с собой");
        User other = userRepo.findById(otherId).orElseThrow(() -> ApiException.notFound("Пользователь не найден"));
        if (other.isSystem()) throw ApiException.badRequest("Это служебный аккаунт");
        if (banService.isBanned(other)) throw ApiException.badRequest("Пользователь недоступен");

        List<Long> existing = memberRepo.findDirectConversationIds(me.getId(), otherId);
        if (!existing.isEmpty()) {
            Conversation c = conversationRepo.findById(existing.get(0)).orElseThrow();
            return buildDto(c, me.getId());
        }

        Conversation c = new Conversation();
        c.setType(ConversationType.DIRECT);
        c.setCreatedBy(me);
        conversationRepo.save(c);
        addMember(c, me, false);
        addMember(c, other, false);

        notifyConversation(c, me.getId()); // собеседнику — новая беседа
        return buildDto(c, me.getId());
    }

    @Transactional
    public ConversationDto createGroup(User me, String title, List<Long> memberIds) {
        if (title == null || title.isBlank()) throw ApiException.badRequest("Введите название группы");

        Conversation c = new Conversation();
        c.setType(ConversationType.GROUP);
        c.setTitle(title.strip());
        c.setCreatedBy(me);
        conversationRepo.save(c);
        addMember(c, me, true);

        Set<Long> added = new HashSet<>(Set.of(me.getId()));
        for (Long uid : (memberIds == null ? List.<Long>of() : memberIds)) {
            if (!added.add(uid)) continue;
            User u = userRepo.findById(uid).orElse(null);
            if (u == null || banService.isBanned(u)) continue;
            addMember(c, u, false);
        }

        notifyConversation(c, me.getId());
        return buildDto(c, me.getId());
    }

    @Transactional
    public ConversationDto addMembers(Long convId, User me, List<Long> memberIds) {
        ConversationMember mine = requireMember(convId, me.getId());
        Conversation c = mine.getConversation();
        if (c.getType() != ConversationType.GROUP) throw ApiException.badRequest("Добавлять участников можно только в группу");

        for (Long uid : (memberIds == null ? List.<Long>of() : memberIds)) {
            if (memberRepo.existsByConversationIdAndUserId(convId, uid)) continue;
            User u = userRepo.findById(uid).orElse(null);
            if (u == null || banService.isBanned(u)) continue;
            addMember(c, u, false);
        }

        notifyConversation(c, null); // оповестить всех актуальных участников
        return buildDto(c, me.getId());
    }

    @Transactional
    public void leave(Long convId, User me) {
        ConversationMember mine = requireMember(convId, me.getId());
        Conversation c = mine.getConversation();
        if (c.getType() != ConversationType.GROUP) throw ApiException.badRequest("Покинуть можно только группу");

        memberRepo.delete(mine);
        if (memberRepo.countByConversationId(convId) == 0) {
            messageRepo.deleteByConversationId(convId);
            conversationRepo.delete(c);
            return;
        }
        notifyConversation(c, null);
    }

    /* ─────────────── Сообщения / статусы ─────────────── */

    @Transactional
    public ChatMessageDto sendMessage(Long convId, User me, String content) {
        ConversationMember mine = requireMember(convId, me.getId());
        if (!me.isSystem() && memberRepo.hasSystemMember(convId)) {
            throw ApiException.forbidden("Системные уведомления — отвечать нельзя");
        }
        if (content == null || content.isBlank()) throw ApiException.badRequest("Пустое сообщение");
        String text = content.strip();
        if (text.length() > 4000) text = text.substring(0, 4000);

        Conversation c = mine.getConversation();
        ChatMessage msg = new ChatMessage();
        msg.setConversation(c);
        msg.setSender(me);
        msg.setContent(text);
        messageRepo.save(msg);

        c.setLastMessageAt(msg.getCreatedAt());
        conversationRepo.save(c);
        mine.setLastReadAt(msg.getCreatedAt()); // своё сообщение сразу «прочитано»
        memberRepo.save(mine);

        ChatMessageDto dto = ChatMessageDto.from(msg);
        ChatEventDto ev = ChatEventDto.of("message");
        ev.setConversationId(c.getId());
        ev.setMessage(dto);
        for (ConversationMember m : memberRepo.findByConversationId(convId)) {
            send(m.getUser().getUsername(), ev);
        }
        return dto;
    }

    @Transactional
    public void markRead(Long convId, User me) {
        ConversationMember mine = requireMember(convId, me.getId());
        Instant now = Instant.now();
        mine.setLastReadAt(now);
        memberRepo.save(mine);

        ChatEventDto ev = ChatEventDto.of("read");
        ev.setConversationId(convId);
        ev.setUser(UserBriefDto.from(me));
        ev.setLastReadAt(now);
        for (ConversationMember m : memberRepo.findByConversationId(convId)) {
            if (m.getUser().getId().equals(me.getId())) continue;
            send(m.getUser().getUsername(), ev);
        }
    }

    @Transactional(readOnly = true)
    public void handleTyping(String username, Long convId) {
        User me = userRepo.findByUsername(username).orElse(null);
        if (me == null || !memberRepo.existsByConversationIdAndUserId(convId, me.getId())) return;
        ChatEventDto ev = ChatEventDto.of("typing");
        ev.setConversationId(convId);
        ev.setUser(UserBriefDto.from(me));
        for (ConversationMember m : memberRepo.findByConversationId(convId)) {
            if (m.getUser().getId().equals(me.getId())) continue;
            send(m.getUser().getUsername(), ev);
        }
    }

    /* ─────────────── Системные уведомления ─────────────── */

    /**
     * Доставляет уведомление пользователю в чат от служебного аккаунта «Система» — личной беседой,
     * только для чтения (заменяет прежнюю отдельную систему уведомлений: бан, предупреждения и т.п.).
     * Тихо ничего не делает, если системный аккаунт ещё не создан или адресат — он сам.
     */
    @Transactional
    public void sendSystemNotification(User target, String text) {
        if (target == null || text == null || text.isBlank()) return;
        User system = userRepo.findBySystemTrue().orElse(null);
        if (system == null || system.getId().equals(target.getId())) return;

        Conversation c = getOrCreateSystemDirect(system, target);

        ChatMessage msg = new ChatMessage();
        msg.setConversation(c);
        msg.setSender(system);
        msg.setContent(text.strip());
        messageRepo.save(msg);

        c.setLastMessageAt(msg.getCreatedAt());
        conversationRepo.save(c);

        // живая доставка как у обычного сообщения: у адресата всплывёт беседа и +1 непрочитанное
        ChatEventDto ev = ChatEventDto.of("message");
        ev.setConversationId(c.getId());
        ev.setMessage(ChatMessageDto.from(msg));
        for (ConversationMember m : memberRepo.findByConversationId(c.getId())) {
            send(m.getUser().getUsername(), ev);
        }
    }

    /** Личная беседа «Система ↔ пользователь»: переиспользуем существующую либо создаём. */
    private Conversation getOrCreateSystemDirect(User system, User target) {
        List<Long> existing = memberRepo.findDirectConversationIds(system.getId(), target.getId());
        if (!existing.isEmpty()) {
            return conversationRepo.findById(existing.get(0)).orElseThrow();
        }
        Conversation c = new Conversation();
        c.setType(ConversationType.DIRECT);
        c.setCreatedBy(system);
        conversationRepo.save(c);
        addMember(c, system, false);
        addMember(c, target, false);
        return c;
    }

    /* ─────────────── Вспомогательное ─────────────── */

    private ConversationMember addMember(Conversation c, User u, boolean owner) {
        ConversationMember m = new ConversationMember();
        m.setConversation(c);
        m.setUser(u);
        m.setOwner(owner);
        return memberRepo.save(m);
    }

    private ConversationMember requireMember(Long convId, Long meId) {
        return memberRepo.findByConversationIdAndUserId(convId, meId)
            .orElseThrow(() -> ApiException.forbidden("Нет доступа к беседе"));
    }

    /** Разослать актуальное состояние беседы участникам (кроме exceptUserId, если задан). */
    private void notifyConversation(Conversation c, Long exceptUserId) {
        for (ConversationMember m : memberRepo.findByConversationId(c.getId())) {
            if (exceptUserId != null && m.getUser().getId().equals(exceptUserId)) continue;
            ChatEventDto ev = ChatEventDto.of("conversation");
            ev.setConversation(buildDto(c, m.getUser().getId()));
            send(m.getUser().getUsername(), ev);
        }
    }

    private void send(String username, ChatEventDto event) {
        messagingTemplate.convertAndSendToUser(username, QUEUE, event);
    }

    private ConversationDto buildDto(Conversation c, Long meId) {
        List<ConversationMember> members = memberRepo.findByConversationId(c.getId());

        ConversationDto dto = new ConversationDto();
        dto.setId(c.getId());
        dto.setType(c.getType().name());
        dto.setTitle(c.getTitle());
        dto.setAvatarUrl(c.getAvatarPath());
        dto.setLastMessageAt(c.getLastMessageAt());
        dto.setMembers(members.stream().map(ChatMemberDto::from).toList());

        ChatMessage last = messageRepo.findTop1ByConversationIdOrderByIdDesc(c.getId());
        dto.setLastMessage(last != null ? ChatMessageDto.from(last) : null);

        ConversationMember mine = members.stream()
            .filter(m -> m.getUser().getId().equals(meId)).findFirst().orElse(null);
        if (mine != null) {
            Instant since = mine.getLastReadAt() != null ? mine.getLastReadAt() : Instant.EPOCH;
            dto.setUnreadCount((int) messageRepo.countByConversationIdAndCreatedAtAfterAndSenderIdNot(c.getId(), since, meId));
        }
        return dto;
    }
}
