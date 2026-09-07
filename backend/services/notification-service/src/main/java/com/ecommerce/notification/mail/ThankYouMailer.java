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
 * Email cảm ơn (D18, tiếng Việt): lời cảm ơn + tóm tắt đơn (items + tổng) +
 * link my-orders + file đính kèm PDF hóa đơn (payload fat §6.1.5 — KHÔNG
 * call-back lấy field). Template inline theo direction (không lib nặng).
 */
@Component
public class ThankYouMailer {

    private static final Logger log = LoggerFactory.getLogger(ThankYouMailer.class);

    private final JavaMailSender mailSender;
    private final NotifyProperties props;

    public ThankYouMailer(JavaMailSender mailSender, NotifyProperties props) {
        this.mailSender = mailSender;
        this.props = props;
    }

    /** Gửi HTML email — ném RuntimeException cho caller log send_log FAILED. */
    public void sendThankYou(String to, String orderId, String emailHtml,
                             InvoiceClient.Attachment invoice) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            // multipart=true vì có thể attach PDF
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            helper.setFrom(props.mail().from());
            helper.setTo(to);
            helper.setSubject("Cảm ơn bạn đã mua hàng — đơn " + shortId(orderId));
            helper.setText(emailHtml, true);
            if (invoice != null) {
                helper.addAttachment(invoice.filename(),
                    new org.springframework.core.io.ByteArrayResource(invoice.pdf()));
            }
            mailSender.send(message);
            log.info("[mail] cảm ơn đã gửi tới {} (đơn {}, attach={})", to, orderId, invoice != null);
        } catch (MessagingException e) {
            throw new IllegalStateException("Dựng email cảm ơn lỗi: " + e.getMessage(), e);
        }
    }

    /** HTML thân email — items[][name, qty, lineTotal], tổng, link my-orders. */
    public String thankYouHtml(java.util.List<Item> items, long subtotal, long discount,
                               long shippingFee, long total, String orderId) {
        StringBuilder rows = new StringBuilder();
        for (Item item : items) {
            rows.append("<tr>")
                .append("<td style=\"padding:6px 12px;border-bottom:1px solid #eee;\">")
                .append(escape(item.name())).append(" × ").append(item.qty()).append("</td>")
                .append("<td style=\"padding:6px 12px;border-bottom:1px solid #eee;text-align:right;\">")
                .append(formatVnd(item.lineTotal())).append("</td>")
                .append("</tr>");
        }
        StringBuilder totals = new StringBuilder()
            .append(row("Tạm tính", formatVnd(subtotal)));
        if (discount > 0) {
            totals.append(row("Giảm giá", "−" + formatVnd(discount)));
        }
        totals.append(row("Phí vận chuyển", formatVnd(shippingFee)))
            .append(row("<strong>Tổng cộng</strong>", "<strong>" + formatVnd(total) + "</strong>"));

        return """
            <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">
              <h2 style="color:#F53D2D;">Cảm ơn bạn đã mua hàng! 🎉</h2>
              <p>Đơn hàng <strong>%s</strong> của bạn đã được xác nhận. File đính kèm là hóa đơn PDF (D18).</p>
              <table style="border-collapse:collapse;width:100%%;font-size:14px;">
                %s
              </table>
              <table style="border-collapse:collapse;width:100%%;font-size:14px;margin-top:8px;">
                %s
              </table>
              <p style="margin-top:16px;">
                <a href="%s" style="color:#F53D2D;">Xem đơn hàng của tôi →</a>
              </p>
              <p style="color:#888;font-size:12px;">Email tự động từ hệ thống demo ecommerce — vui lòng không trả lời.</p>
            </div>
            """.formatted(shortId(orderId), rows, totals, props.mail().myOrdersUrl());
    }

    private String row(String label, String value) {
        return "<tr><td style=\"padding:4px 12px;\">" + label + "</td>"
            + "<td style=\"padding:4px 12px;text-align:right;\">" + value + "</td></tr>";
    }

    private String escape(String text) {
        return text == null ? "" : text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    /** VND zero-decimal — 1.234.567₫. */
    private String formatVnd(long amount) {
        return String.format("%,d₫", amount).replace(',', '.');
    }

    private String shortId(String orderId) {
        return orderId != null && orderId.length() > 8 ? "#" + orderId.substring(0, 8).toUpperCase() : orderId;
    }

    /** Item render tối thiểu từ fat payload. */
    public record Item(String name, int qty, long lineTotal) {
    }
}
