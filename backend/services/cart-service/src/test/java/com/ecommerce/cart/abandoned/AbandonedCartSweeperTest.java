package com.ecommerce.cart.abandoned;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.context.TestPropertySource;

import com.ecommerce.cart.AbstractCartIntegrationTest;
import com.ecommerce.cart.domain.CartModels.CartDocument;
import com.ecommerce.cart.domain.CartModels.LineItem;
import com.ecommerce.cart.store.CartStore;

/**
 * IT abandoned cart sweeper (SF-13 A4). RabbitTemplate @SpyBean stub doAnswer
 * — chặn publish (không cần broker; envelope assert từ Message bắt được),
 * Redis THẬT cho flag logic. Giỏ stale có email → publish đúng 1 lần (flag
 * 24h chặn lần 2); giỏ hot / không email / rỗng → không publish.
 */
@Tag("integration")
@TestPropertySource(properties = {
    "cart.abandoned.enabled=true",
    // không broker — publish bị spy chặn trước khi chạm connection
    "spring.rabbitmq.host=localhost",
    "spring.rabbitmq.port=1"
})
class AbandonedCartSweeperTest extends AbstractCartIntegrationTest {

    @SpyBean
    RabbitTemplate rabbit;
    @Autowired
    CartStore cartStore;
    @Autowired
    StringRedisTemplate redis;
    @Autowired
    AbandonedCartSweeper sweeper;

    @BeforeEach
    void cleanFlagsAndStubPublish() {
        // redis SHARED giữa các test class + context cached — dọn cả giỏ user
        // lẫn flag để sweep không thấy data test trước
        redis.delete(redis.keys("cart:user:*"));
        redis.delete(redis.keys("cart:abandoned_notified:*"));
        // spy chặn send — KHÔNG chạm broker (port 1 đóng); invocation vẫn ghi nhận
        doAnswer(inv -> null).when(rabbit)
            .send(anyString(), eq("cart.abandoned"), any(Message.class));
    }

    /** Ghi giỏ user với updatedAt tùy ý — trả sub. */
    private String userCart(String email, int itemCount, Instant updatedAt) {
        String sub = UUID.randomUUID().toString();
        LineItem item = new LineItem(UUID.randomUUID(), UUID.randomUUID(), null, itemCount,
            "op-la", "Áo phông", "", 150_000, false);
        cartStore.save(CartStore.userKey(sub),
            new CartDocument(itemCount > 0 ? List.of(item) : List.of(), updatedAt, email));
        return sub;
    }

    @Test
    void staleCartWithEmail_publishesOnce_flagBlocksSecondSweep() throws Exception {
        String sub = userCart("abandoned@demo.vn", 2,
            Instant.now().minus(Duration.ofHours(2).plusSeconds(60)));

        sweeper.sweep();

        ArgumentCaptor<Message> msg = ArgumentCaptor.forClass(Message.class);
        verify(rabbit, times(1)).send(anyString(), eq("cart.abandoned"), msg.capture());
        String body = new String(msg.getValue().getBody(), StandardCharsets.UTF_8);
        assertThat(body).contains("abandoned@demo.vn").contains("cart.abandoned").contains(sub);
        assertThat(redis.hasKey("cart:abandoned_notified:" + sub)).isTrue();

        // sweep lần 2 — flag chặn: vẫn chỉ 1 lần publish
        sweeper.sweep();
        verify(rabbit, times(1)).send(anyString(), eq("cart.abandoned"), any(Message.class));
    }

    @Test
    void hotCart_orNoEmail_orEmpty_notPublished() {
        userCart("fresh@demo.vn", 1, Instant.now()); // còn nóng
        userCart(null, 1, Instant.now().minus(Duration.ofHours(3))); // thiếu email
        userCart("empty@demo.vn", 0, Instant.now().minus(Duration.ofHours(3))); // giỏ rỗng

        sweeper.sweep();

        verify(rabbit, times(0)).send(anyString(), eq("cart.abandoned"), any(Message.class));
    }
}
