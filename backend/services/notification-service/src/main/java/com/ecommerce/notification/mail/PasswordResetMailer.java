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
 * Email đặt lại mật khẩu (SF-13 A1, tiếng Việt) — link
 * {@code /reset-password?token=…} (shell origin, config
 * {@code notify.mail.reset-password-url}). Token single-use 30' ở identity;
 * email nhắc rõ "không yêu cầu → bỏ qua" (anti-social-engineering).
 */
@Component
public class PasswordResetMailer {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetMailer.class);

    private final JavaMailSender mailSender;
    private final NotifyProperties props;

    public PasswordResetMailer(JavaMailSender mailSender, NotifyProperties props) {
        this.mailSender = mailSender;
        this.props = props;
    }

    /** Gửi HTML email — ném RuntimeException cho caller log send_log FAILED. */
    public void sendResetEmail(String to, String token) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setFrom(props.mail().from());
            helper.setTo(to);
            helper.setSubject("Đặt lại mật khẩu — Ecommerce Demo");
            helper.setText(resetHtml(token), true);
            mailSender.send(message);
            log.info("[mail] password reset đã gửi tới {}", to);
        } catch (MessagingException e) {
            throw new IllegalStateException("Dựng email reset mật khẩu lỗi: " + e.getMessage(), e);
        }
    }

    String resetHtml(String token) {
        String link = props.mail().resetPasswordUrl() + "?token=" + token;
        return """
            <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">
              <h2 style="color:#F53D2D;">Đặt lại mật khẩu</h2>
              <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
              <p style="margin:24px 0;">
                <a href="%s" style="background:#F53D2D;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;">Đặt lại mật khẩu</a>
              </p>
              <p>Link có hiệu lực <strong>30 phút</strong> và chỉ dùng được một lần.</p>
              <p style="color:#888;font-size:12px;">Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.</p>
            </div>
            """.formatted(link);
    }
}
