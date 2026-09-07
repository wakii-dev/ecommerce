package com.ecommerce.notification.mail;

import com.ecommerce.notification.config.NotifyProperties;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

/**
 * Email "bỏ quên giỏ hàng" (SF-13 A4, tiếng Việt) — nhắc items còn trong giỏ
 * + link /cart (shell). Fat payload từ event cart.abandoned (email + itemCount
 * + updatedAt) — KHÔNG call-back cart.
 */
@Component
public class AbandonedCartMailer {

    private static final Logger log = LoggerFactory.getLogger(AbandonedCartMailer.class);

    private final JavaMailSender mailSender;
    private final NotifyProperties props;

    public AbandonedCartMailer(JavaMailSender mailSender, NotifyProperties props) {
        this.mailSender = mailSender;
        this.props = props;
    }

    /** Gửi HTML email — ném RuntimeException cho caller log send_log FAILED. */
    public void sendAbandonedCartEmail(String to, int itemCount) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setFrom(props.mail().from());
            helper.setTo(to);
            helper.setSubject("Giỏ hàng của bạn vẫn còn " + itemCount + " sản phẩm đang chờ 🛒");
            helper.setText(abandonedHtml(itemCount), true);
            mailSender.send(message);
            log.info("[mail] abandoned cart đã gửi tới {} ({} items)", to, itemCount);
        } catch (MessagingException e) {
            throw new IllegalStateException("Dựng email bỏ quên giỏ lỗi: " + e.getMessage(), e);
        }
    }

    String abandonedHtml(int itemCount) {
        String cartUrl = props.mail().cartUrl();
        return """
            <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">
              <h2 style="color:#F53D2D;">Giỏ hàng đang chờ bạn 🛒</h2>
              <p>Bạn còn <strong>%d sản phẩm</strong> chưa thanh toán trong giỏ hàng.</p>
              <p style="margin:24px 0;">
                <a href="%s" style="background:#F53D2D;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;">Tiếp tục mua sắm</a>
              </p>
              <p style="color:#888;font-size:12px;">Email tự động từ hệ thống demo ecommerce — vui lòng không trả lời.</p>
            </div>
            """.formatted(itemCount, cartUrl);
    }
}
