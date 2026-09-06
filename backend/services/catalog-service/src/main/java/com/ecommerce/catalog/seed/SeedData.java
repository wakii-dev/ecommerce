package com.ecommerce.catalog.seed;

import java.util.List;

/**
 * Dữ liệu seed Tiki-style bilingual (Task 9) — holder thuần KHÔNG Spring,
 * {@link SeedDataRunner} map sang entity. 6 gốc category + 16 con; 24 products
 * (tên dễ search, KHÔNG trùng): price VND 290.000–24.990.000, 8 sản
 * compare_price > price, 4 sản flash (+2 ngày lúc seed — runner gắn), ~nửa
 * official, rating 4.0–4.9 / count 45–2.500, ảnh placeholder url "" + alt
 * (storefront render gradient §1.8), variants màu/size cho 6 SP thời trang.
 * Product tham chiếu category qua {@code categorySlugVi} (slug_vi).
 */
public final class SeedData {

    private SeedData() {
    }

    /** Node danh mục — children lồng, parent_id gán lúc insert. */
    public record CategorySeed(String vi, String en, String slugVi, String slugEn, String icon,
                               List<CategorySeed> children) {
    }

    /** Ảnh placeholder — url rỗng (gradient theo category), alt bắt buộc. */
    public record ImageSeed(String url, String alt, int position) {
    }

    /** Variant seed — price null = không override; nameVi/nameEn null = fallback join color/size (Q5c). */
    public record VariantSeed(String color, String size, Long price, String nameVi, String nameEn) {
    }

    public record ProductSeed(String nameVi, String nameEn, String slugVi, String slugEn,
                              String descVi, String descEn, String brand, String categorySlugVi,
                              long price, Long comparePrice, boolean flash, boolean official,
                              List<String> tags, String ratingAvg, int ratingCount,
                              List<ImageSeed> images, List<VariantSeed> variants) {
    }

    public static List<CategorySeed> categories() {
        return List.of(
            new CategorySeed("Điện Tử", "Electronics", "dien-tu", "electronics", "⚡", List.of(
                new CategorySeed("Điện Thoại", "Phones", "dien-thoai", "phones", "📱", List.of()),
                new CategorySeed("Laptop & Máy Tính", "Laptops & Computers", "laptop-may-tinh", "laptops-computers", "💻", List.of()),
                new CategorySeed("Điện Gia Dụng", "Home Appliances", "dien-gia-dung", "home-appliances", "🔌", List.of()))),
            new CategorySeed("Thời Trang", "Fashion", "thoi-trang", "fashion", "👕", List.of(
                new CategorySeed("Thời Trang Nam", "Men", "thoi-trang-nam", "men", "👔", List.of()),
                new CategorySeed("Thời Trang Nữ", "Women", "thoi-trang-nu", "women", "👗", List.of()),
                new CategorySeed("Giày Dép", "Shoes", "giay-dep", "shoes", "👟", List.of()))),
            new CategorySeed("Nhà Cửa", "Home & Living", "nha-cua", "home-living", "🏠", List.of(
                new CategorySeed("Phòng Ngủ", "Bedroom", "phong-ngu", "bedroom", "🛏️", List.of()),
                new CategorySeed("Nhà Bếp", "Kitchen", "nha-bep", "kitchen", "🍳", List.of()))),
            new CategorySeed("Sách", "Books", "sach", "books", "📚", List.of(
                new CategorySeed("Tiểu Thuyết", "Fiction", "tieu-thuyet", "fiction", "📖", List.of()),
                new CategorySeed("Sách Thiếu Nhi", "Children's Books", "sach-thieu-nhi", "children-books", "🧒", List.of()))),
            new CategorySeed("Làm Đẹp", "Beauty", "lam-dep", "beauty", "💄", List.of(
                new CategorySeed("Chăm Sóc Da", "Skincare", "cham-soc-da", "skincare", "🧴", List.of()),
                new CategorySeed("Trang Điểm", "Makeup", "trang-diem", "makeup", "💅", List.of()))),
            new CategorySeed("Mẹ & Bé", "Mom & Baby", "me-va-be", "mom-baby", "🍼", List.of(
                new CategorySeed("Tã & Chăm Sóc Bé", "Diapering & Care", "ta-cham-soc-be", "diapering-care", "🧷", List.of()),
                new CategorySeed("Sữa & Dinh Dưỡng", "Formula & Nutrition", "sua-dinh-duong", "formula-nutrition", "🥛", List.of()))));
    }

    public static List<ProductSeed> products() {
        return List.of(
            // ── Điện Tử (7 — /c/dien-tu ≥ 4) ─────────────────────────────────
            product("Điện Thoại Xiaomi Redmi 13C", "Xiaomi Redmi 13C Phone",
                "dien-thoai-xiaomi-redmi-13c", "xiaomi-redmi-13c-phone",
                "Pin 5000mAh, màn hình 90Hz, camera 50MP — chiếc điện thoại giá rẻ bán chạy nhất.",
                "5000mAh battery, 90Hz display, 50MP camera — the best-value phone.",
                "Xiaomi", "dien-thoai", 3_290_000L, 3_990_000L, true, true,
                List.of("Chính hãng", "Hàng mới"), "4.7", 1520,
                imgs("Điện thoại Xiaomi Redmi 13C màu xanh", "Redmi 13C mặt lưng", "Redmi 13C hộp"), List.of()),
            product("Điện Thoại Nokia 110 (2023)", "Nokia 110 (2023) Keypad Phone",
                "dien-thoai-nokia-110-2023", "nokia-110-2023-keypad-phone",
                "Điện thoại phím bấm pin trâu, mp3, đèn pin — bền bỉ cho mọi nhà.",
                "Keypad phone with long battery, MP3 and torch — durable for everyone.",
                "Nokia", "dien-thoai", 590_000L, null, false, true,
                List.of("Chính hãng"), "4.5", 830,
                imgs("Nokia 110 màu đen", "Nokia 110 bàn phím"), List.of()),
            product("Laptop ASUS VivoBook 15 OLED", "ASUS VivoBook 15 OLED Laptop",
                "laptop-asus-vivobook-15-oled", "asus-vivobook-15-oled-laptop",
                "Màn hình OLED 15.6\", Core i5 thế hệ 13, RAM 16GB, SSD 512GB mỏng nhẹ.",
                "15.6\" OLED, 13th-gen Core i5, 16GB RAM, 512GB SSD, slim.",
                "ASUS", "laptop-may-tinh", 15_490_000L, 17_990_000L, true, true,
                List.of("Chính hãng", "Freeship"), "4.6", 214,
                imgs("Laptop ASUS VivoBook 15 OLED", "VivoBook bàn phím", "VivoBook cổng kết nối"), List.of()),
            product("Tai Nghe Bluetooth Xiaomi Redmi Buds 4", "Xiaomi Redmi Buds 4 Bluetooth Earbuds",
                "tai-nghe-bluetooth-xiaomi-redmi-buds-4", "xiaomi-redmi-buds-4-bluetooth-earbuds",
                "Tai nghe true-wireless chống ồn chủ động, pin 30 giờ kèm hộp sạc.",
                "True-wireless earbuds with ANC, 30-hour battery with case.",
                "Xiaomi", "dien-tu", 690_000L, null, false, true,
                List.of("Chính hãng"), "4.4", 2100,
                imgs("Tai nghe Redmi Buds 4 trắng", "Redmi Buds 4 kèm hộp sạc"), List.of()),
            product("Smart TV Samsung 43 Inch Crystal UHD 4K", "Samsung 43-inch Crystal UHD 4K Smart TV",
                "smart-tv-samsung-43-inch", "samsung-43-inch-crystal-uhd-4k-smart-tv",
                "TV 43 inch 4K Crystal UHD, HDR, loa 20W, smart Tizen xem YouTube netflix mượt.",
                "43-inch 4K Crystal UHD TV with HDR, 20W speakers, Tizen smart hub.",
                "Samsung", "dien-tu", 7_490_000L, null, true, true,
                List.of("Chính hãng", "Freeship"), "4.6", 512,
                imgs("Smart TV Samsung 43 inch", "Samsung TV viền mỏng"), List.of()),
            product("Nồi Chiên Không Dầu Sunhouse 5.5 Lít", "Sunhouse 5.5L Air Fryer",
                "noi-chien-khong-dau-sunhouse-5-5l", "sunhouse-5-5l-air-fryer",
                "Nồi chiên không dầu 5.5L, 8 menu cài sẵn, lòng đáy chống dính tháo rửa dễ.",
                "5.5L air fryer, 8 preset menus, non-stick removable basket.",
                "Sunhouse", "dien-gia-dung", 1_290_000L, null, false, false,
                List.of("Freeship"), "4.5", 1890,
                imgs("Nồi chiên không dầu Sunhouse", "Sunhouse giỏ chiên"), List.of()),
            product("Máy Xay Sinh Tố Philips 1.5 Lít", "Philips 1.5L Blender",
                "may-xay-sinh-to-philips-1-5l", "philips-1-5l-blender",
                "Máy xay sinh tố 1.5L cối thủy tinh, 6 lưỡi thép, 2 cấp độ xay + xay đá.",
                "1.5L glass-jar blender, 6 steel blades, 2 speeds + ice crush.",
                "Philips", "dien-gia-dung", 890_000L, null, false, false,
                List.of(), "4.3", 356,
                imgs("Máy xay sinh tố Philips", "Philips cối thủy tinh"), List.of()),

            // ── Thời Trang (6 — variants màu/size) ───────────────────────────
            product("Áo Thun Nam Uniqlo DRY-EX", "Uniqlo Men DRY-EX T-Shirt",
                "ao-thun-nam-uniqlo-dry-ex", "uniqlo-men-dry-ex-t-shirt",
                "Áo thun nam chất DRY-EX thoát nhiệt nhanh, form regular thoải mái đi làm đi chơi.",
                "DRY-EX quick-dry tee, regular fit for work and casual.",
                "Uniqlo", "thoi-trang-nam", 390_000L, null, false, true,
                List.of("Chính hãng"), "4.7", 2400,
                imgs("Áo thun Uniqlo DRY-EX đen", "Uniqlo DRY-EX mặc mẫu"),
                sizes(null, "M", "L", "XL")),
            product("Váy Hoa Nữ Dạ Voan", "Women Floral Chiffon Dress",
                "vay-hoa-nu-da-voan", "women-floral-chiffon-dress",
                "Váy hoa nữ dạ voan bay bồng, ôm dáng nhẹ nhàng — dự tiệc hay đi biển đều hợp.",
                "Flowy floral chiffon dress, light A-line — party or beach ready.",
                "Yody", "thoi-trang-nu", 459_000L, 619_000L, false, false,
                List.of("Hàng mới"), "4.4", 680,
                imgs("Váy hoa dạ voan nền trắng", "Váy hoa mặc mẫu"),
                sizes(null, "S", "M")),
            product("Giày Sneaker Biti's Hunter Street", "Biti's Hunter Street Men Sneaker",
                "giay-sneaker-bitis-hunter-street", "bitis-hunter-street-men-sneaker",
                "Sneaker Biti's Hunter Street đế êm, chất liệu thoáng khí đi cả ngày.",
                "Hunter Street sneaker with soft sole and breathable upper.",
                "Biti's", "giay-dep", 749_000L, 999_000L, true, true,
                List.of("Chính hãng", "Freeship"), "4.6", 1250,
                imgs("Giày Biti's Hunter màu đỏ", "Biti's Hunter đế cao su"),
                List.of(new VariantSeed("Đỏ", "40", 799_000L, "Đỏ / 40", "Red / 40"),
                    new VariantSeed("Đen", "41", null, null, null))),
            product("Quần Jean Nam Slim Fit", "Men Slim Fit Jeans",
                "quan-jean-nam-slim-fit", "men-slim-fit-jeans",
                "Quần jean nam slim fit vải co giãn, đường may chắc chắn, dễ phối áo.",
                "Slim-fit stretch jeans, sturdy seams, easy to pair.",
                "Yody", "thoi-trang-nam", 499_000L, null, false, false,
                List.of(), "4.2", 95,
                imgs("Quần jean nam xanh đậm", "Jean slim fit chi tiết"),
                colorSizes(null, "30", "32")),
            product("Áo Sơ Mi Nữ Tay Dài", "Women Long Sleeve Shirt",
                "ao-so-mi-nu-tay-dai", "women-long-sleeve-shirt",
                "Sơ mi nữ tay dài vải lụa mềm, lên form thanh lịch cho công sở.",
                "Long-sleeve soft satin shirt, office-ready tailored fit.",
                "Owen", "thoi-trang-nu", 359_000L, null, false, false,
                List.of("Hàng mới"), "4.3", 210,
                imgs("Áo sơ mi nữ trắng", "Sơ mi nữ cổ đi"),
                sizes(null, "S", "M")),
            product("Dép Sandal Nữ Quai Ngang", "Women Cross-Strap Sandals",
                "dep-sandal-nu-quai-ngang", "women-cross-strap-sandals",
                "Sandal nữ quai ngang da mềm, đế bún chống trượt — đi mưa đi nắng đều ổn.",
                "Soft-strap sandals with anti-slip sole — rain or shine.",
                "Biti's", "giay-dep", 290_000L, null, false, false,
                List.of("Freeship"), "4.0", 45,
                imgs("Sandal nữ quai ngang be", "Sandal đế chống trượt"),
                sizes(null, "36", "37")),

            // ── Nhà Cửa (2) ──────────────────────────────────────────────────
            product("Bộ Chăn Ga Gối Cotton 4 Món", "4-Piece Cotton Bedding Set",
                "bo-chan-ga-goi-cotton-4-mon", "4-piece-cotton-bedding-set",
                "Chăn ga gối 4 món cotton 100% thấm hút tốt, hoa văn tinh tế cho phòng ngủ.",
                "4-piece 100% cotton bedding set, absorbent and elegant.",
                "Hanvico", "phong-ngu", 899_000L, 1_290_000L, false, true,
                List.of("Chính hãng"), "4.8", 950,
                imgs("Bộ chăn ga gối cotton họa tiết", "Chăn ga gối gấp gọn"), List.of()),
            product("Bộ Nồi Inox Sunhouse 5 Món", "Sunhouse 5-Piece Stainless Steel Pot Set",
                "bo-noi-inox-sunhouse-5-mon", "sunhouse-5-piece-inox-pot-set",
                "Bộ nồi inox 304 5 món sáng bóng, đáy từ truyền nhiệt đều, dùng cho mọi loại bếp.",
                "5-piece 304 stainless steel set, induction-ready even-heat base.",
                "Sunhouse", "nha-bep", 1_690_000L, null, false, false,
                List.of("Freeship"), "4.5", 310,
                imgs("Bộ nồi inox Sunhouse 5 món", "Nồi inox đáy từ"), List.of()),

            // ── Sách (3) ─────────────────────────────────────────────────────
            product("Bộ Sách Nhà Giả Kim (Bìa Cứng)", "The Alchemist Hardcover Box Set",
                "bo-sach-nha-gia-kim-bia-cung", "the-alchemist-hardcover-box-set",
                "Tiểu thuyết Nhà Giả Kim của Paulo Coelho — hành trình Santiago tìm kho báu và ước mơ.",
                "The Alchemist by Paulo Coelho — Santiago's journey to his dream.",
                "NXB Kim Đồng", "tieu-thuyet", 290_000L, 420_000L, false, false,
                List.of("Hàng mới"), "4.9", 2500,
                imgs("Sách Nhà Giả Kim bìa cứng", "Nhà Giả Kim trang trong sách"), List.of()),
            product("Sách Tuổi Trẻ Đáng Giá Bao Nhiêu", "How Much Is Youth Worth",
                "sach-tuoi-tre-dang-gia-bao-nhieu", "how-much-is-youth-worth",
                "Cuốn sách truyền cảm hứng cho người trẻ về đam mê, kỷ luật và lựa chọn.",
                "An inspiring read for the young on passion, discipline, choices.",
                "NXB Trẻ", "tieu-thuyet", 320_000L, null, false, false,
                List.of(), "4.8", 1800,
                imgs("Sách Tuổi Trẻ Đáng Giá Bao Nhiêu", "Bìa sách Tuổi Trẻ"), List.of()),
            product("Sách Dooki: Khu Rừng Cổ Tích", "Dooki: The Enchanted Forest",
                "sach-dooki-khu-rung-co-tich", "dooki-the-enchanted-forest",
                "Sách tranh thiếu nhi Dooki khám phá khu rừng cổ tích, giấy dày màu sắc bắt mắt.",
                "Dooki picture book exploring an enchanted forest, thick colorful pages.",
                "NXB Kim Đồng", "sach-thieu-nhi", 310_000L, null, false, false,
                List.of("Hàng mới"), "4.7", 890,
                imgs("Sách Dooki khu rừng cổ tích", "Dooki trang minh họa"), List.of()),

            // ── Làm Đẹp (3) ──────────────────────────────────────────────────
            product("Son Dưỡng Laneige Lip Sleeping Mask", "Laneige Lip Sleeping Mask",
                "son-duong-laneige-lip-sleeping-mask", "laneige-lip-sleeping-mask",
                "Mặt nạ ngủ dưỡng môi Laneige 20g — môi mềm mọng buổi sáng, hương berry ngọt.",
                "Laneige overnight lip mask 20g — soft plump lips, berry scent.",
                "Laneige", "cham-soc-da", 590_000L, 720_000L, false, true,
                List.of("Chính hãng"), "4.8", 1650,
                imgs("Son dưỡng Laneige Lip Sleeping Mask", "Laneige hộp 20g"), List.of()),
            product("Kem Chống Nắng Anessa Perfect UV", "Anessa Perfect UV Sunscreen Milk",
                "kem-chong-nang-anessa-perfect-uv", "anessa-perfect-uv-sunscreen-milk",
                "Kem chống nắng Anessa SPF50+ PA++++ chống water 80 phút, dịu nhẹ cho da.",
                "Anessa SPF50+ PA++++, 80-minute water resistance, gentle on skin.",
                "Anessa", "cham-soc-da", 499_000L, null, false, true,
                List.of("Chính hãng", "Hàng mới"), "4.7", 2300,
                imgs("Kem chống nắng Anessa vàng", "Anessa 60ml"), List.of()),
            product("Phấn Nước Cushion Maybelline Super BB", "Maybelline Super BB Cushion Foundation",
                "phan-nuoc-cushion-maybelline-super-bb", "maybelline-super-bb-cushion-foundation",
                "Cushion Maybelline Super BB lì mịn 12 giờ, che phủ tự nhiên kèm ruột thay thế.",
                "Maybelline Super BB cushion, 12-hour matte, refill included.",
                "Maybelline", "trang-diem", 359_000L, null, false, false,
                List.of(), "4.4", 560,
                imgs("Phấn nước Maybelline Super BB", "Cushion Maybelline kèm ruột"), List.of()),

            // ── Mẹ & Bé (3) ──────────────────────────────────────────────────
            product("Tã Dán Huggies Platinum Size M 68 Miếng", "Huggies Platinum Diapers Size M 68pcs",
                "ta-dan-huggies-platinum-size-m-68-mieng", "huggies-platinum-m-68pcs",
                "Tã dán Huggies Platinum M cho bé 6-11kg, siêu mềm mại, thấm hút 12 giờ.",
                "Huggies Platinum M for 6-11kg babies, ultra-soft, 12-hour absorbency.",
                "Huggies", "ta-cham-soc-be", 520_000L, 685_000L, false, true,
                List.of("Chính hãng"), "4.8", 1980,
                imgs("Tã dán Huggies Platinum gói M", "Huggies Platinum chi tiết"), List.of()),
            product("Sữa Bột Nan Grow Stage 3 900g", "Nan Grow Stage 3 Formula 900g",
                "sua-bot-nan-grow-stage-3-900g", "nan-grow-stage-3-900g",
                "Sữa bột Nan Grow 3 cho bé 2-6 tuổi, bổ sung vi chất, vị ngon dễ uống.",
                "Nan Grow 3 for ages 2-6, added micronutrients, tasty and easy.",
                "Nestlé", "sua-dinh-duong", 489_000L, null, false, true,
                List.of("Chính hãng"), "4.6", 1120,
                imgs("Sữa bột Nan Grow 3 hộp 900g", "Nan Grow muỗng đo"), List.of()),
            product("Kem Dưỡng Ẩm Da Bé Mustela", "Mustela Baby Moisturizer",
                "kem-duong-am-da-be-mustela", "mustela-baby-moisturizer",
                "Kem dưỡng ẩm Mustela cho da bé khô nhạy cảm, không hương liệu, an toàn từ ngày 1.",
                "Mustela moisturizer for dry sensitive baby skin, fragrance-free, day-1 safe.",
                "Mustela", "ta-cham-soc-be", 480_000L, null, false, false,
                List.of("Freeship"), "4.7", 430,
                imgs("Kem dưỡng da bé Mustela", "Mustela tuýp 200ml"), List.of()));
    }

    // ── helper dữ liệu gọn ───────────────────────────────────────────────────

    private static List<ImageSeed> imgs(String... alts) {
        List<ImageSeed> out = new java.util.ArrayList<>();
        for (int i = 0; i < alts.length; i++) {
            out.add(new ImageSeed("", alts[i], i)); // url rỗng → gradient placeholder (§1.8)
        }
        return out;
    }

    /** Variants chỉ size (áo/quần) — name null → fallback join Q5c. */
    private static List<VariantSeed> sizes(String color, String... sizeList) {
        List<VariantSeed> out = new java.util.ArrayList<>();
        for (String s : sizeList) {
            out.add(new VariantSeed(color, s, null, null, null));
        }
        return out;
    }

    private static List<VariantSeed> colorSizes(String color, String... sizeList) {
        return sizes(color, sizeList);
    }

    private static ProductSeed product(String nameVi, String nameEn, String slugVi, String slugEn,
                                       String descVi, String descEn, String brand, String categorySlugVi,
                                       long price, Long comparePrice, boolean flash, boolean official,
                                       List<String> tags, String ratingAvg, int ratingCount,
                                       List<ImageSeed> images, List<VariantSeed> variants) {
        return new ProductSeed(nameVi, nameEn, slugVi, slugEn, descVi, descEn, brand, categorySlugVi,
            price, comparePrice, flash, official, tags, ratingAvg, ratingCount, images, variants);
    }
}
