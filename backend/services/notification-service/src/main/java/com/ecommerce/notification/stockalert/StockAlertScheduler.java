package com.ecommerce.notification.stockalert;

import com.ecommerce.notification.domain.SendLog;
import com.ecommerce.notification.repo.SendLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Restock checker (SF-15): poll catalog internal candidates → claim atomic →
 * gửi email từng alert + SendLog. Claim TRƯỚC gửi sau: catalog flip
 * ACTIVE→NOTIFIED chỉ thắng 1 lần → **email đúng 1 lần** (crash giữa chừng =
 * mất mail, không dup — tradeoff đã ghi spec §4.3). enabled=false → no-op.
 */
@Component
public class StockAlertScheduler {

    static final String EVENT_TYPE = "stockalert.restocked";

    private static final Logger log = LoggerFactory.getLogger(StockAlertScheduler.class);

    private final StockAlertProperties props;
    private final CatalogStockAlertClient client;
    private final RestockMailer mailer;
    private final SendLogRepository sendLog;

    public StockAlertScheduler(StockAlertProperties props, CatalogStockAlertClient client,
                               RestockMailer mailer, SendLogRepository sendLog) {
        this.props = props;
        this.client = client;
        this.mailer = mailer;
        this.sendLog = sendLog;
    }

    @Scheduled(
        fixedDelayString = "${notify.stock-alert.interval-ms:60000}",
        initialDelayString = "${notify.stock-alert.initial-delay-ms:3000}")
    public void tick() {
        if (!props.enabled()) return;
        List<CatalogStockAlertClient.Candidate> candidates = client.candidates(50);
        if (candidates.isEmpty()) return;
        List<CatalogStockAlertClient.Candidate> claimed = client.claim(candidates);
        log.info("[stock-alert] candidates={} claimed={}", candidates.size(), claimed.size());
        for (CatalogStockAlertClient.Candidate candidate : claimed) {
            try {
                mailer.send(candidate);
                sendLog.save(new SendLog(candidate.alertId(), EVENT_TYPE, candidate.email(),
                    "Hàng về rồi — " + candidate.productName(), SendLog.STATUS_SENT, false, null));
            } catch (Exception e) {
                // SMTP lỗi → ghi FAILED, KHÔNG rethrow (scheduler tick sau
                // không gửi lại — alert đã claimed; mailer lỗi là mất mail,
                // tradeoff exactly-once đã chọn).
                log.warn("[stock-alert] gửi mail lỗi cho {}: {}", candidate.email(), e.getMessage());
                sendLog.save(new SendLog(candidate.alertId(), EVENT_TYPE, candidate.email(),
                    "Hàng về rồi — " + candidate.productName(), SendLog.STATUS_FAILED, false, e.getMessage()));
            }
        }
    }
}
