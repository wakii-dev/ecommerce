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

/** Email chào mừng newsletter (SF-13 A8, tiếng Việt) — link coupon center. */
@Component
public class WelcomeNewsletterMailer {

    private static final Logger log = LoggerFactory.getLogger(WelcomeNewsletterMailer.class);

    private final JavaMailSender mailSender;
    private final NotifyProperties props;

    public WelcomeNewsletterMailer(JavaMailSender mailSender, NotifyProperties props) {
        this.mailSender = mailSender;
        this.props = props;
    }

    /** Gửi HTML email — ném RuntimeException cho caller log send_log FAILED. */
    public void sendWelcomeEmail(String to) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setFrom(props.mail().from());
            helper.setTo(to);
            helper.setSubject("Chào mừng bạn đến với Ecommerce Demo 🎉");
            helper.setText(welcomeHtml(), true);
            mailSender.send(message);
            log.info("[mail] newsletter welcome đã gửi tới {}", to);
        } catch (MessagingException e) {
            throw new IllegalStateException("Dựng email chào mừng lỗi: " + e.getMessage(), e);
        }
    }

    String welcomeHtml() {
        return """
            <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">
              <h2 style="color:#F53D2D;">Chào mừng bạn! 🎉</h2>
              <p>Cảm ơn bạn đã đăng ký nhận tin. Bạn sẽ là người đầu tiên nhận khuyến mãi và flash deal mới nhất.</p>
              <p style="margin:24px 0;">
                <a href="%s" style="background:#F53D2D;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;">Xem mã giảm giá hôm nay</a>
              </p>
              <p style="color:#888;font-size:12px;">Email tự động từ hệ thống demo ecommerce — vui lòng không trả lời.</p>
            </div>
            """.formatted(props.mail().couponCenterUrl());
    }
}
