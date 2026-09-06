package com.ecommerce.ordering.repo;

import com.ecommerce.ordering.domain.InvoiceSequence;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InvoiceSequenceRepository extends JpaRepository<InvoiceSequence, InvoiceSequence.Pk> {

    /**
     * Cấp số HĐ tuần tự (D18) — guarded UPDATE trong tx ngắn: rowcount 1 =
     * đường uncontended bình thường (row đã seed); 0 = row chưa có → caller
     * INSERT seed rồi gọi lại (race-safe, không mất số). flushAutomatically:
     * seed INSERT đang chờ phải xuống DB TRƯỚC bulk-UPDATE (attempt 2 sau seed).
     */
    @Modifying(flushAutomatically = true)
    @Query("UPDATE InvoiceSequence s SET s.lastNumber = s.lastNumber + 1, s.updatedAt = CURRENT_TIMESTAMP "
        + "WHERE s.mauSo = :mauSo AND s.kyHieu = :kyHieu AND s.year = :year")
    int increment(@Param("mauSo") String mauSo, @Param("kyHieu") String kyHieu, @Param("year") int year);

    /**
     * Đọc số mới sau increment — SCALAR projection (KHÔNG managed entity):
     * entity đọc sau bulk-UPDATE trả về snapshot L1-cache STALE (seed save()
     * gắn instance lastNumber=0 vào context → findForRead tái dùng nó → cấp
     * số 0 → invoice-service 422). Scalar bypass L1, luôn fresh.
     */
    @Query("SELECT s.lastNumber FROM InvoiceSequence s "
        + "WHERE s.mauSo = :mauSo AND s.kyHieu = :kyHieu AND s.year = :year")
    Long readLastNumber(@Param("mauSo") String mauSo,
                        @Param("kyHieu") String kyHieu,
                        @Param("year") int year);
}
