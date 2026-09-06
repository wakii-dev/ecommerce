package com.ecommerce.common.outbox;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProcessedMessageRepository extends JpaRepository<ProcessedMessage, String> {

    /**
     * Insert bỏ-qua-trùng: trả 1 nếu consumer ĐẦU TIÊN, 0 nếu đã tồn tại.
     * Native + ON CONFLICT DO NOTHING — thực thi ngay (rowcount), không abort
     * transaction khi trùng (khác INSERT thường ném DataIntegrityViolation
     * và abort cả tx).
     */
    @Modifying
    @Query(value = "INSERT INTO processed_messages (message_id) VALUES (:messageId) ON CONFLICT DO NOTHING",
        nativeQuery = true)
    int insertIgnore(@Param("messageId") String messageId);
}
