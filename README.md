# AI Business Assistant — v1

KOBİ'ler ve ajanslar için marka kimliğini bilen yapay zekâ içerik asistanı.

## Teknoloji

- **Next.js** (arayüz + API route'ları)
- **Supabase** (PostgreSQL, giriş, dosya depolama)
- **OpenAI API** (metin üretimi)
- Görsel üretimi için ayrı API (Modül 3'te seçilecek)
- **GitHub** (sürüm kontrolü)

## v1 modülleri ve geliştirme sırası

1. **Business Profile** — `businesses`, `social_accounts`
2. **AI Content Generator** — marka prompt katmanı (`brand-prompt.ts`) + `contents`
3. **Content Library** — üretilen içeriği saklama, arama, düzenleme, indirme
4. **Content Calendar** — `calendar_items`, taslak/onaylı durumu, hatırlatma
5. **AI Visual Creator** — hazır şablonlar + görsel API (en belirsiz ve en maliyetli, sona bırakıldı)

## Dosyalar

| Dosya | Amaç |
|---|---|
| `schema.sql` | Tablolar, ilişkiler, RLS politikaları. Supabase SQL Editor'da çalıştırılır. |
| `brand-prompt.ts` | İşletme profilini her üretim isteğine ekleyen fonksiyonlar ve model çıktısı doğrulaması. |

## Güvenlik kuralları (canlıya çıkmadan önce zorunlu)

- Tüm tablolarda RLS açık; her işletme yalnızca sahibine görünür. İki ayrı hesapla erişim testi yapılmadan yayına çıkılmaz.
- OpenAI ve Supabase `service_role` anahtarları yalnızca sunucuda tutulur, tarayıcıya gönderilmez.
- Kullanıcı girdisi prompt'a veri olarak girer (`clean()` fonksiyonu); model çıktısı kaydedilmeden önce doğrulanır.
- Kullanıcı başına üretim limiti (rate limit) eklenir; aksi halde API maliyeti kontrolsüz artar.
- AI ile yazılan her kod gözden geçirilip test edilmeden birleştirilmez.

## Açık kararlar

- İlk müşteriler yalnızca Türkçe mi, iki dil mi? (Şema `tr`/`en` destekliyor; arayüz metinleri bu karara göre kurulacak.)
- Görsel üretim API'si seçimi (Modül 3).
- Ödeme altyapısı: ilk müşteriler ve pazar netleşince.

## Sonraki adım

Next.js projesini oluşturmak, Supabase'e `schema.sql`'i yüklemek ve Business Profile formunu yazmak.

## Güncel durum

| Modül | Sayfa | Durum |
|---|---|---|
| Business Profile | `/` | Hazır (Supabase + e-posta/şifre girişi) |
| AI Content Generator | `/uret` | Hazır (Gemini → DeepSeek → OpenAI sırasıyla yedekli) |
| AI Visual Creator | `/gorsel` | Hazır: 5 şablon, 3 format, PNG indirme, yapay zekâ/yüklenen arka plan |
| Content Calendar | `/takvim` | Hazır: ay/hafta görünümü, hatırlatma (sayfa içi), elle paylaşım |
| Content Library | `/kutuphane` | Hazır: arama, düzenleme, onay, indirme, yeniden kullanma |

### Ortam değişkenleri (Vercel)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `GEMINI_API_KEY`
(isteğe bağlı: `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `GEMINI_MODEL`, `GEMINI_IMAGE_MODEL`).
Gizli anahtarlar `NEXT_PUBLIC_` ile başlamaz.

### Veritabanı

1. `schema.sql` (ilk kurulum)
2. `schema_v2_image_usage.sql` (görsel üretim limiti için; `/api/image` bunu gerektirir)

### Bilinçli olarak ertelenenler

Otomatik paylaşım, video üretimi, analiz, rakip analizi, reklam yönetimi, ekip yönetimi, CRM.
Görseller şimdilik kaydedilmez (indirilir); Storage'a kaydetme sonraki aşama.
