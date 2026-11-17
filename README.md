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
