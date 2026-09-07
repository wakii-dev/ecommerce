package com.ecommerce.notification.stockalert;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

/**
 * Email "hàng về rồi" (SF-15, tiếng Việt — pattern ThankYouMailer: template
 * inline, Mailpit sink dev). Link PDP có locale prefix (route [locale]/p/[slug]).
 */
@Component
public class RestockMailer {

    private static final Logger log = LoggerFactory.getLogger(RestockMailer.class);

    private final JavaMailSender mailSender;
    private final StockAlertProperties props;
    private final String from;

    public RestockMailer(JavaMailSender mailSender, StockAlertProperties props,
                         @Value("${notify.mail.from:no-reply@demo.vn}") String from) {
        this.mailSender = mailSender;
        this.props = props;
        this.from = from;
    }

    public void send(CatalogStockAlertClient.Candidate candidate) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setFrom(from);
            helper.setTo(candidate.email());
            helper.setSubject("Hàng về rồi — " + candidate.productName());
            helper.setText(restockHtml(candidate.productName(), candidate.variantName(), candidate.slug()), true);
            mailSender.send(message);
            log.info("[stock-alert] email restock đã gửi tới {} ({})", candidate.email(), candidate.productName());
        } catch (MessagingException e) {
            throw new IllegalStateException("Dựng email restock lỗi: " + e.getMessage(), e);
        }
    }

    /** HTML thân email — tên sản phẩm + variant + link PDP. */
    String restockHtml(String productName, String variantName, String slug) {
        String variant = variantName == null || variantName.isBlank() ? "" : " — " + escape(variantName);
        String link = props.storefrontUrl() + "/vi/p/" + slug;
        return """
            <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">
              <h2 style="color:#F53D2D;">Sản phẩm bạn chờ đã có hàng lại! 🎉</h2>
              <p><strong>%s</strong>%s vừa được nhập thêm về kho.</p>
              <p style="margin-top:16px;">
                <a href="%s" style="display:inline-block;background:#F53D2D;color:#fff;padding:10px 22px;
                   border-radius:6px;text-decoration:none;font-weight:600;">Mua ngay →</a>
              </p>
              <p style="color:#888;font-size:12px;margin-top:20px;">
                Bạn nhận được email này vì đã đăng ký "Nhắn tôi khi có hàng" trên ShopVN — chỉ 1 lần cho đợt nhập hàng này.
              </p>
            </div>
            """.formatted(escape(productName), variant, link);
    }

    private String escape(String text) {
        return text == null ? "" : text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
