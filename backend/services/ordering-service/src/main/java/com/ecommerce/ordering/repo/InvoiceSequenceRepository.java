package com.ecommerce.ordering.repo;

import com.ecommerce.ordering.domain.InvoiceSequence;
import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;

public interface InvoiceSequenceRepository extends JpaRepository<InvoiceSequence, InvoiceSequence.Pk> {

    /**
     * Cấp số HĐ tuần tự (D18) — guarded UPDATE trong tx ngắn: rowcount 1 =
     * đường uncontended bình thường (row đã seed); 0 = row chưa có → caller
     * INSERT ON CONFLICT DO NOTHING rồi gọi lại (race-safe, không mất số).
     */
    @Modifying
    @Query("UPDATE InvoiceSequence s SET s.lastNumber = s.lastNumber + 1, s.updatedAt = CURRENT_TIMESTAMP "
        + "WHERE s.mauSo = :mauSo AND s.kyHieu = :kyHieu AND s.year = :year")
    int increment(@Param("mauSo") String mauSo, @Param("kyHieu") String kyHieu, @Param("year") int year);

    @Lock(LockModeType.PESSIMISTIC_READ)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
    @Query("SELECT s FROM InvoiceSequence s WHERE s.mauSo = :mauSo AND s.kyHieu = :kyHieu AND s.year = :year")
    InvoiceSequence findForRead(@Param("mauSo") String mauSo,
                                @Param("kyHieu") String kyHieu,
                                @Param("year") int year);
}
