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
 * Email RMA (SF-14, D22) — 4 template theo pack: approved / received /
 * refunded / rejected. Payload FAT từ ordering ({@code rma.<status>} có sẵn
 * email — KHÔNG call-back). Pattern inline template như ThankYouMailer.
 */
@Component
public class RmaMailer {

    private static final Logger log = LoggerFactory.getLogger(RmaMailer.class);

    private final JavaMailSender mailSender;
    private final NotifyProperties props;

    public RmaMailer(JavaMailSender mailSender, NotifyProperties props) {
        this.mailSender = mailSender;
        this.props = props;
    }

    /** Gửi HTML — ném RuntimeException cho consumer log send_log FAILED. */
    public void send(String to, String subject, String html) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setFrom(props.mail().from());
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(html, true);
            mailSender.send(message);
            log.info("[mail] RMA đã gửi tới {} («{}»)", to, subject);
        } catch (MessagingException e) {
            throw new IllegalStateException("Dựng email RMA lỗi: " + e.getMessage(), e);
        }
    }

    /** Subject theo bước — khớp template pack (approved/received/refunded/rejected). */
    public String subject(String rmaStatus, String orderId) {
        String shortId = orderId != null && orderId.length() > 8
            ? "#" + orderId.substring(0, 8).toUpperCase() : String.valueOf(orderId);
        return switch (rmaStatus) {
            case "APPROVED" -> "Yêu cầu trả hàng được duyệt — đơn " + shortId;
            case "RECEIVED" -> "Đã nhận hàng trả về — đơn " + shortId;
            case "REFUNDED" -> "Hoàn tiền thành công — đơn " + shortId;
            case "REJECTED" -> "Yêu cầu trả hàng bị từ chối — đơn " + shortId;
            default -> "Cập nhật yêu cầu trả hàng — đơn " + shortId;
        };
    }

    /** HTML thân email theo trạng thái RMA. */
    public String html(String rmaStatus, String orderId, String reason, Long refundAmount) {
        String headline;
        String body;
        switch (rmaStatus == null ? "" : rmaStatus) {
            case "APPROVED" -> {
                headline = "Yêu cầu trả hàng của bạn đã được DUYỆT ✅";
                body = "Vui lòng đóng gói sản phẩm và gửi trả theo hướng dẫn. "
                    + "Khi kho nhận được hàng, chúng tôi sẽ thông báo qua email.";
            }
            case "RECEIVED" -> {
                headline = "Chúng tôi đã NHẬN được hàng trả về 📦";
                body = "Bộ phận kiểm tra đang xác nhận sản phẩm. Sau khi hoàn tất, "
                    + "tiền sẽ được hoàn về phương thức thanh toán của bạn.";
            }
            case "REFUNDED" -> {
                headline = "HOÀN TIỀN thành công 💰";
                body = "Số tiền " + (refundAmount != null ? formatVnd(refundAmount) + " " : "")
                    + "đang được hoàn về tài khoản/thẻ của bạn (Stripe test wallet trong môi trường demo). "
                    + "Thời gian nhận tiền tuỳ ngân hàng, thường 5-7 ngày làm việc.";
            }
            case "REJECTED" -> {
                headline = "Yêu cầu trả hàng bị TỪ CHỐI ❌";
                body = "Rất tiếc yêu cầu của bạn không được chấp thuận."
                    + (reason != null && !reason.isBlank()
                        ? " Lý do từ hệ thống: " + escape(reason) + "."
                        : "");
            }
            default -> {
                headline = "Cập nhật yêu cầu trả hàng";
                body = "Trạng thái yêu cầu: " + rmaStatus;
            }
        }
        return """
            <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">
              <h2 style="color:#F53D2D;">%s</h2>
              <p>%s</p>
              <p style="color:#555;font-size:14px;">Đơn hàng: <strong>%s</strong> · Lý do trả hàng: %s</p>
              <p style="margin-top:16px;">
                <a href="%s" style="color:#F53D2D;">Xem đơn hàng của tôi →</a>
              </p>
              <p style="color:#888;font-size:12px;">Email tự động từ hệ thống demo ecommerce — vui lòng không trả lời.</p>
            </div>
            """.formatted(headline, body, shortOrderId(orderId),
            escape(reason == null || reason.isBlank() ? "—" : reason),
            props.mail().myOrdersUrl());
    }

    private String shortOrderId(String orderId) {
        return orderId != null && orderId.length() > 8 ? "#" + orderId.substring(0, 8).toUpperCase() : String.valueOf(orderId);
    }

    private String escape(String text) {
        return text == null ? "" : text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private String formatVnd(long amount) {
        return String.format("%,d₫", amount).replace(',', '.');
    }
}
