package com.ecommerce.ordering.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * Số hóa đơn tuần tự theo (mẫu số, ký hiệu, năm) — D18: business truth thuộc
 * Java (renderer Python stateless KHÔNG sinh số). Cấp số qua guarded UPDATE
 * ở {@code InvoiceSequenceRepository}.
 */
@Entity
@Table(name = "invoice_sequences")
@IdClass(InvoiceSequence.Pk.class)
public class InvoiceSequence {

    @Id
    @Column(name = "mau_so", length = 32)
    private String mauSo;

    @Id
    @Column(name = "ky_hieu", length = 32)
    private String kyHieu;

    @Id
    private int year;

    @Column(name = "last_number", nullable = false)
    private long lastNumber;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected InvoiceSequence() {
    }

    public InvoiceSequence(String mauSo, String kyHieu, int year) {
        this.mauSo = mauSo;
        this.kyHieu = kyHieu;
        this.year = year;
        this.lastNumber = 0;
    }

    /** Composite PK (mau_so, ky_hieu, year). */
    public static class Pk implements Serializable {

        private String mauSo;
        private String kyHieu;
        private int year;

        public Pk() {
        }

        public Pk(String mauSo, String kyHieu, int year) {
            this.mauSo = mauSo;
            this.kyHieu = kyHieu;
            this.year = year;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) {
                return true;
            }
            if (!(o instanceof Pk pk)) {
                return false;
            }
            return year == pk.year && Objects.equals(mauSo, pk.mauSo) && Objects.equals(kyHieu, pk.kyHieu);
        }

        @Override
        public int hashCode() {
            return Objects.hash(mauSo, kyHieu, year);
        }
    }

    public String getMauSo() {
        return mauSo;
    }

    public String getKyHieu() {
        return kyHieu;
    }

    public int getYear() {
        return year;
    }

    public long getLastNumber() {
        return lastNumber;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
