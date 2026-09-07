import type { Locale } from '../lib/format';
import NewsletterForm from './NewsletterForm';

/** 4 cột nội dung static (plan Task 10: static OK) — tiêu đề cột bilingual. */
const COLUMNS: Record<Locale, ReadonlyArray<{ title: string; links: ReadonlyArray<string> }>> = {
  vi: [
    { title: 'Chăm sóc khách hàng', links: ['Trung tâm trợ giúp', 'Hướng dẫn mua hàng', 'Thanh toán & Vận chuyển', 'Đổi trả & Hoàn tiền'] },
    { title: 'Về Shop VN', links: ['Giới thiệu', 'Tuyển dụng', 'Chính sách bảo mật', 'Liên hệ hợp tác'] },
    { title: 'Danh mục nổi bật', links: ['Điện tử', 'Thời trang', 'Nhà cửa & Đời sống', 'Sách', 'Làm đẹp'] },
    { title: 'Theo dõi chúng tôi', links: ['Facebook', 'Instagram', 'YouTube', 'TikTok'] },
  ],
  en: [
    { title: 'Customer care', links: ['Help center', 'Shopping guide', 'Payment & shipping', 'Returns & refunds'] },
    { title: 'About Shop VN', links: ['About us', 'Careers', 'Privacy policy', 'Partner with us'] },
    { title: 'Top categories', links: ['Electronics', 'Fashion', 'Home & living', 'Books', 'Beauty'] },
    { title: 'Follow us', links: ['Facebook', 'Instagram', 'YouTube', 'TikTok'] },
  ],
};

/**
 * Footer §2.2.5: nền #212121 (var --c-text), 4 cột gap 32px, link #bbb hover
 * accent. SF-13 A8: cột newsletter (client island — subscribe form) bên phải.
 */
export default function Footer({ locale }: { locale: Locale }) {
  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        {COLUMNS[locale].map((column) => (
          <section key={column.title}>
            <h4>{column.title}</h4>
            <ul>
              {column.links.map((label) => (
                <li key={label}>
                  <a href="#">{label}</a>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <NewsletterForm locale={locale} />
      </div>
    </footer>
  );
}
