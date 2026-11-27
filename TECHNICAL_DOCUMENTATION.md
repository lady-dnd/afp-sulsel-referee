# Dokumentasi Teknis AFP Sulsel / APSSI Sulsel

## Sistem Informasi Manajemen Wasit dan Event Futsal

**Tanggal dokumentasi:** 27 November 2026  
**Bahasa:** Indonesia  
**Tujuan:** Referensi pengembangan mandiri, serah terima engineer, dan pengarahan AI coding di luar Lovable.  
**Baseline kode:** commit `1650216` (status notifikasi WhatsApp), dilanjutkan `4f06702` (README).  
**Lingkungan saat ini:** TanStack Start, React, Lovable Cloud, runtime Worker.

> Dokumen ini membedakan implementasi yang terlihat di kode, aturan bisnis yang disepakati, dan rekomendasi pengembangan. Tidak menyatakan aplikasi telah diaudit menyeluruh secara operasional atau siap produksi tanpa syarat. Pengujian yang telah dijalankan pada sesi dokumentasi: **36 berkas / 150 tes lulus**. Pengiriman WhatsApp nyata, semua alur peran, pemulihan cadangan, dan deployment mandiri belum diverifikasi dalam sesi ini.

> Penamaan organisasi dalam permintaan menggunakan APSSI Sulsel; antarmuka, metadata, dan template teknis saat ini banyak menggunakan AFP Sulsel. Jangan mengganti nama, template provider, atau identitas dokumen resmi tanpa persetujuan pemilik proyek.

---

## Daftar Isi

1. Tujuan produk dan batas ruang lingkup
2. Prinsip bisnis yang wajib dipertahankan
3. Arsitektur dan teknologi
4. Struktur repositori
5. Identitas, autentikasi, dan otorisasi
6. Siklus event dan booking wilayah
7. Penugasan wasit
8. Penyelesaian event dan honor
9. Notifikasi WhatsApp dan tindak lanjut
10. Model data dan RPC
11. Peta halaman
12. Kontrak layanan server
13. Keamanan dan perlindungan data
14. Menjalankan proyek di luar Lovable
15. Strategi pemindahan infrastruktur
16. Standar pengembangan
17. Pengujian dan kriteria penerimaan
18. Gap dan roadmap
19. Panduan untuk AI coding
20. Checklist serah terima

---

## 1. Tujuan Produk dan Batas Ruang Lingkup

Aplikasi mengelola aktivitas wasit futsal dan penyelenggaraan event di Sulawesi Selatan dengan pembagian kewenangan tingkat provinsi dan kabupaten/kota.

### 1.1 Hasil yang ingin dicapai

- Calon penyelenggara dapat melihat kalender publik sebelum mengajukan event.
- Hanya satu booking event aktif diperbolehkan dalam kabupaten/kota yang sama pada tanggal yang bertumpang tindih.
- Panitia mengajukan event, tetapi tidak menjalankan kewenangan admin.
- Admin Provinsi mengelola pengajuan dan penugasan lintas kabupaten/kota di wilayah operasional proyek.
- Admin Kabupaten/Kota hanya menjalankan kewenangan event di wilayahnya sendiri.
- Wasit menerima penugasan dan pemberitahuan event selesai untuk mengajukan honor.
- Administrator dapat melihat notifikasi WhatsApp bermasalah dan melakukan tindak lanjut.
- Profil, kartu wasit, evaluasi, pembelajaran, diskusi, laporan, dan dokumen mendukung pembinaan serta administrasi.

### 1.2 Batas ruang lingkup

- Sistem bukan platform pembayaran otomatis. Status honor terverifikasi tidak membuktikan transfer uang telah dilakukan.
- Satu event bukan selalu satu pertandingan; jangan menambahkan asumsi kickoff per pertandingan tanpa model data yang disepakati.
- Booking menggunakan rentang tanggal, bukan inventori lapangan per jam.
- Pengembangan mandiri tidak otomatis memindahkan database, akun autentikasi, storage, atau rahasia dari Lovable Cloud.

## 2. Prinsip Bisnis yang Wajib Dipertahankan

| Prinsip | Ketentuan |
|---|---|
| Pemisahan Panitia | Panitia bukan Admin Provinsi maupun Admin Kabupaten/Kota. |
| Persetujuan event | Hanya Admin Provinsi atau Admin Kabupaten/Kota yang wilayahnya sesuai. |
| Penugasan wasit | Hanya admin yang berwenang terhadap wilayah event, pada status yang memperbolehkan penugasan. |
| Pembuatan oleh provinsi | Admin Provinsi dapat memilih seluruh kabupaten/kota yang didukung aplikasi; status awal `DISETUJUI`. |
| Pengajuan non-provinsi | Status awal `DIAJUKAN`; tidak boleh memperoleh persetujuan otomatis hanya melalui manipulasi payload. |
| Reservasi tanggal | `DIAJUKAN` dan `DISETUJUI` sama-sama memesan tanggal. |
| Bentrok tanggal | Tanggal batas bersifat inklusif; dua event yang berbagi satu tanggal tetap bentrok. |
| Honor | Draft otomatis bernominal 0 adalah tempat pengisian, bukan bukti honor telah diterima atau dibayar. |
| Privasi | Kalender publik tidak boleh berubah menjadi akses publik terhadap kontak pribadi, honor, atau kredensial provider. |

Untuk fungsi yang belum ditelaah rinci, terutama pembayaran, evaluasi, dan cakupan laporan, gunakan aturan aktual di RLS/RPC serta konfirmasi pemilik proyek sebelum memperluas izin.

## 3. Arsitektur dan Teknologi

### 3.1 Diagram aliran

```text
Browser
  ├── React + TanStack Router + komponen UI
  ├── Query hooks → API database dengan sesi pengguna → RLS
  └── invokeServerTask → /api/functions/$name
                              │
                              ├── verifikasi bearer token
                              ├── lazy-load registry task
                              └── handler: validasi peran, wilayah, payload
                                      ├── database / RPC
                                      ├── provider email
                                      └── provider WhatsApp

Provider WhatsApp → /api/public/*-webhook → verifikasi provider → pencatatan status
Foto profil publik → /api/public/avatars/* → pembacaan terbatas dari bucket privat
```

### 3.2 Versi pada manifest saat dokumentasi

| Komponen | Versi deklarasi |
|---|---|
| React / React DOM | `^19.2.0` |
| TanStack Start | `1.168.60` |
| TanStack Router | `1.170.41` |
| TanStack Query | `^5.101.1` |
| Vite | `8.1.5` |
| Tailwind CSS | `^4.2.1` |
| TypeScript | `^5.8.3` |
| Vitest | `^4.1.10` |
| Zod | `^3.25.76` |
| pdf-lib | `^1.17.1` |

Versi di `package.json` dan lockfile adalah acuan; jangan menurunkan versi berdasarkan dokumentasi lama yang menyebut Vite 7. Versi dengan `^` dapat menghasilkan versi terpasang yang berbeda; gunakan lockfile untuk reproduksibilitas.

### 3.3 Batas browser dan server

- SSR dapat mengevaluasi import modul. Komponen browser-only harus dimuat secara dinamis setelah hidrasi bila dependensinya tidak aman di server.
- Akses storage browser untuk nilai yang tampil dilakukan setelah hidrasi, bukan hanya dengan guard `typeof window` di initializer.
- Server produksi memakai runtime Worker, bukan proses Node.js penuh maupun Deno asli.
- `src/server/edge-runtime.ts` menyediakan adaptor pemanggilan lama; nama `Deno.env.get` di kode tidak berarti handler berjalan di Deno.
- SMTP melalui adaptor saat ini tidak tersedia: `SMTPClient.send()` melempar error. Gunakan jalur provider email yang didukung.

## 4. Struktur Repositori

```text
AGENTS.md                          Aturan kerja repositori dan batas pengelolaan platform
package.json                       Script dan dependensi
bun.lock                           Lockfile dependensi
vite.config.ts                     Konfigurasi bundler dan bootstrap
vitest.config.ts                   Konfigurasi pengujian
src/
  router.tsx                       Bootstrap TanStack Router
  routes/                          Halaman dan server routes
    __root.tsx                     Shell, Outlet, provider, error boundary, head
    index.tsx                      Homepage dan kalender publik
    api/functions.$name.ts         Dispatcher task terautentikasi
    api/public/                    Avatar dan webhook provider
  components/                      Komponen domain dan design system
    auth/ProtectedRoute.tsx         Guard antarmuka
    events/EventWhatsAppStatusTab.tsx
    home/PublicEventCalendar.tsx
  contexts/                        Auth, notifikasi, tahun berjalan
  hooks/                           Query/mutation per domain
  repositories/auth/               Pemisahan akses auth, profil, dan peran
  lib/                             Aturan domain dan helper
  server/
    edge-runtime.ts                Adaptor runtime warisan
    edge/                          Handler task dan registry
      _shared/                     Helper otorisasi dan dukungan server
  integrations/supabase/           Klien dan tipe backend yang dihasilkan platform
  test/                            Tes kontrak dan perilaku
  styles.css                       Token dan CSS global
  routeTree.gen.ts                 Route tree yang dihasilkan otomatis
drizzle/
  schema.ts                        Representasi skema
  migrations/                      Riwayat migrasi SQL dan metadata
supabase/                          Konfigurasi integrasi yang dikelola platform
```

Nama direktori integrasi adalah identifier teknis yang sudah ada. Jangan mengubahnya hanya untuk mengganti nama layanan.

### 4.1 Entry points penting

- Root merangkai `QueryClientProvider`, `AuthProvider`, `CurrentYearProvider`, `NotificationProvider`, tooltip, dan toast.
- `Outlet` wajib dipertahankan agar route anak dirender.
- Halaman warisan memakai shim `@/lib/navigation`; router yang sebenarnya tetap TanStack Router.
- Registry task menggunakan lazy import, sehingga nama task harus terdaftar sebelum pemanggilan.

## 5. Identitas, Autentikasi, dan Otorisasi

### 5.1 Peran aplikasi

```typescript
export const APP_ROLES = [
  "admin_provinsi",
  "admin_kab_kota",
  "panitia",
  "wasit",
  "evaluator",
] as const;
```

Akun dapat mempunyai lebih dari satu peran. Urutan pemilihan peran utama dalam `AuthContext`:

```text
admin_provinsi > admin_kab_kota > evaluator > panitia > wasit
```

Peran utama dipakai untuk konteks antarmuka; jangan mengabaikan daftar `roles` ketika handler atau guard sengaja memeriksa multi-role.

### 5.2 Profil dan status registrasi

`AuthContext` memisahkan resolusi sesi, profil, dan peran. Profil minimal yang digunakan mencakup `id`, `full_name`, `is_profile_complete`, `kabupaten_kota_id`, `registration_status`, dan `requested_role`.

Urutan guard pada `ProtectedRoute`:

1. Tunggu pemuatan autentikasi.
2. Jika tidak login, arahkan ke `/login`.
3. Jika resolusi otorisasi error, tampilkan error; jangan memberikan izin default.
4. Jika profil hilang, tampilkan keadaan profil tidak tersedia; aplikasi tidak membuat profil diam-diam.
5. Registrasi pending diarahkan ke `/pending-approval`.
6. Registrasi rejected diblokir.
7. Tanpa peran, tampilkan menunggu persetujuan.
8. Jika profil lengkap diwajibkan, arahkan ke pengisian profil.
9. Periksa kebutuhan admin dan daftar peran yang diperbolehkan.

### 5.3 Matriks event yang menjadi acuan

| Tindakan | Admin Provinsi | Admin Kabupaten/Kota | Panitia | Wasit / Evaluator |
|---|---|---|---|---|
| Kalender publik | Ya | Ya | Ya | Ya |
| Buat event | Semua wilayah operasional; langsung disetujui | Wilayah sendiri; diajukan | Pengajuan sesuai cakupan form/RLS | Tidak diberikan sebagai kewenangan umum |
| Approve/reject | Semua wilayah | Wilayah sendiri | Tidak | Tidak |
| Tugaskan wasit | Event disetujui | Event disetujui di wilayah sendiri | Tidak | Tidak |
| Monitoring/retry WhatsApp | Semua wilayah | Wilayah sendiri | Tidak | Tidak |
| Edit | Helper mengizinkan provinsi | Event diajukan di wilayah sendiri | Helper mengizinkan creator pada event diajukan | Creator branch tetap harus tunduk pada RLS |

**Catatan penting:** helper `canEditEvent` memiliki cabang creator tanpa pembatasan eksplisit peran. Hal ini tidak berarti semua peran boleh membuat event; otorisasi akhir tetap bergantung pada guard halaman dan RLS. Jangan menyalin helper UI sebagai satu-satunya pemeriksaan server.

### 5.4 Sumber aturan otorisasi

- UI event: `src/lib/eventPermissions.ts`.
- Auth domain: `src/repositories/auth/authorization.ts`.
- Handler: `src/server/edge/_shared/authorization.ts` dan pemeriksaan wilayah di handler.
- Database: RLS, GRANT, dan RPC.

Tiga lapisan harus konsisten. Menyembunyikan tombol bukan perlindungan data.

## 6. Siklus Event dan Booking Wilayah

### 6.1 Status event

```text
Pengajuan non-provinsi → DIAJUKAN → DISETUJUI → SELESAI
                              └──→ DITOLAK
Pembuatan provinsi ────────────→ DISETUJUI
```

Diagram merupakan alur utama, bukan izin untuk mengubah status langsung dari semua halaman. Setiap transisi harus mengikuti fungsi dan kebijakan database.

### 6.2 Trigger booking

Sumber SQL: `drizzle/migrations/0009_add_event_region_booking_lock.sql`.

- Fungsi: `public.prevent_event_region_date_overlap()`.
- Trigger: `trg_prevent_event_region_date_overlap`.
- Waktu: sebelum INSERT atau UPDATE kolom wilayah, tanggal, status, dan `deleted_at`.
- Fungsi menggunakan `SECURITY DEFINER` dengan `search_path = public`.

Rentang efektif:

```sql
start_effective = COALESCE(start_date, date)
end_effective   = COALESCE(end_date, start_date, date)
```

Trigger melewati pemeriksaan apabila event dihapus secara lunak, tidak memiliki wilayah, bukan `DIAJUKAN`/`DISETUJUI`, atau tanggal efektif tidak tersedia. Karena itu validasi kolom wajib di form dan skema tetap penting.

Penguncian konkuren:

```sql
pg_advisory_xact_lock(
  hashtext('event_booking_' || NEW.kabupaten_kota_id::text)
)
```

Konflik terjadi apabila:

```text
wilayah sama
AND event aktif dan tidak deleted
AND event lain bukan dirinya sendiri
AND start_baru <= end_lama
AND end_baru >= start_lama
```

### 6.3 Error booking

| Penanda | SQLSTATE | Makna |
|---|---|---|
| `EVENT_DATE_CONFLICT:` | `23P01` | Rentang bertumpang tindih pada wilayah yang sama |
| `INVALID_EVENT_DATE_RANGE:` | `22007` | Tanggal selesai sebelum mulai |

`mapBookingErrorMessage()` menerjemahkan error tersebut menjadi pesan Indonesia. Jangan mengganti penanda SQL tanpa memperbarui frontend dan tes.

### 6.4 RPC ketersediaan

- `check_event_schedule_conflict(p_kabupaten_kota_id, p_start_date, p_end_date, p_exclude_event_id)` untuk pemeriksaan rentang; diberikan kepada pengguna authenticated dan service role.
- `get_booked_event_dates(p_kabupaten_kota_id, p_exclude_event_id)` untuk kalender; diberikan kepada anon, authenticated, dan service role.
- `p_exclude_event_id` diperlukan saat edit agar event tidak berbenturan dengan dirinya sendiri.

### 6.5 Konsekuensi aturan saat ini

- `SELESAI` tidak lagi mengunci tanggal; kalender masih dapat menampilkan riwayat event selesai.
- Tidak ada pengecualian booking khusus Admin Provinsi dalam trigger tersebut.
- Tanggal terakhir event A tidak boleh menjadi tanggal pertama event B jika wilayahnya sama.
- Event di wilayah berbeda dapat memakai tanggal yang sama.
- Trigger baru tidak otomatis membersihkan konflik historis yang sudah tersimpan.
- Dua submit bersamaan harus diuji pada database nyata, bukan hanya tes helper JavaScript.

## 7. Penugasan Wasit

Sumber utama:

- `src/hooks/useEventAssignments.ts`.
- `src/routes/events.$id.assign-referees.tsx`.
- `src/lib/eventPermissions.ts`.
- RPC `transition_event_assignment_status`.
- Tabel `event_assignments`, `assignment_notifications`, dan `notification_channel_claims`.

Aturan izin penugasan: event harus `DISETUJUI`; Admin Provinsi atau Admin Kabupaten/Kota yang sesuai wilayah dapat menugaskan. Panitia tidak boleh menulis penugasan.

**Konvensi status:** kode penyelesaian mengambil penugasan dengan `status = "confirmed"`. Kode monitoring mengecualikan `cancelled` dan `declined`. Jangan memakai `CONFIRMED`/`PENDING` huruf besar berdasarkan dokumentasi lama. Baca state machine, enum/constraint, dan tes sebelum menambahkan transisi.

### 7.1 Alur notifikasi penugasan

```text
Penugasan dibuat/diubah
  → pemanggilan orchestrator
  → claim kanal
  → kirim melalui provider
  → simpan status, message id, error code
  → tampil di monitoring event
```

Task terkait: `notification-orchestrator`, `send-assignment-notification`, `send-whatsapp`.

Keterkaitan penugasan dengan event serta otorisasi wilayah harus diperiksa kembali di handler; jangan mempercayai `eventId` atau `assignmentId` yang dikirim browser.

## 8. Penyelesaian Event dan Honor

### 8.1 Manual

`useCompleteEvent()` menjalankan:

1. RPC `mark_event_completed` dengan `p_event_id` dan `p_notes`.
2. Setelah RPC berhasil, memanggil `send-event-completion-notification`.
3. Menginvalidasi query event/approval dan menampilkan event selesai.

Penyelesaian dan dispatch notifikasi adalah **dua operasi terpisah**, bukan transaksi atomik bersama. RPC sukses tidak membuktikan draft honor dan WhatsApp berhasil dibuat.

### 8.2 Otomatis

`auto-complete-events.ts` memakai `dispatchEventCompletionNotifications()`. Keberadaan task bukan bukti scheduler operasional aktif. Pengaturan pemicu, jadwal, dan otorisasi harus diverifikasi terpisah.

### 8.3 Dispatch penyelesaian

`dispatchEventCompletionNotifications()`:

- Memastikan event tersedia dan `SELESAI`.
- Mengambil penugasan `confirmed` yang tidak deleted.
- Mencari honor dan notifikasi in-app yang sudah ada.
- Membuat honor baru dengan `amount: 0`, `status: "draft"` jika belum ada.
- Membuat notifikasi in-app `action: "event_completed"`.
- Mengklaim kanal WhatsApp per event/wasit dengan RPC.
- Mengirim template penyelesaian melalui Meta.
- Memfinalisasi claim menjadi `sent`, `failed`, atau `skipped`.

### 8.4 Siklus honor

```text
draft (nominal awal 0)
  → wasit mengisi nominal dan catatan
  → submitted
  → verified atau rejected
```

Halaman: `/referee/honor`; hook: `useHonors.ts` dan `useEligibleHonorEvents.ts`.

Status harus lowercase: `draft`, `submitted`, `verified`, `rejected`. Jangan memasukkan status honor `PENDING`.

### 8.5 Batas keandalan

- Pembuatan draft menggunakan pemeriksaan sebelum insert; jaminan anti-duplikasi perlu didukung unique constraint dan pengujian konkuren.
- Error insert draft/notifikasi tidak selalu dilempar menjadi kegagalan seluruh dispatch.
- Hook penyelesaian memakai `invokeServerTask` yang mengembalikan `{ data, error }`; sekadar `try/catch` tidak menangkap setiap kegagalan HTTP yang dikembalikan sebagai `error`.
- Klaim WhatsApp tidak otomatis menjadikan seluruh operasi honor dan in-app exactly-once.

Rekomendasi: outbox transaksional, error eksplisit, constraint unik, serta rekonsiliasi event selesai yang kehilangan draft/notifikasi.

## 9. Notifikasi WhatsApp dan Tindak Lanjut

### 9.1 Dua jalur konfigurasi yang perlu diselaraskan

| Jalur | Implementasi terlihat |
|---|---|
| Penugasan | `send-whatsapp.ts` mendukung provider Meta dan Kirisan serta konfigurasi terkait |
| Event selesai | `send-event-completion-notification.ts` mengirim langsung ke Meta menggunakan environment server |

Keberhasilan uji konfigurasi penugasan tidak membuktikan konfigurasi penyelesaian tersedia. Jangan menganggap kedua jalur membaca sumber kredensial yang identik.

### 9.2 Template pada kode

| Kebutuhan | Nama/default kode | Bahasa |
|---|---|---|
| Default Meta penugasan di sender | `afp_sulsel_referee_assignmen_new` | `en` |
| Kirisan penugasan | `afp_sulsel_referee_assignment` | `en_US` |
| Meta penyelesaian | `afp_sulsel_event_selesai_honor` | `id` |

Pemilik proyek sebelumnya menyetujui rancangan template penugasan `afp_sulsel_penugasan_wasit`. Nama yang disetujui dan default sender tidak identik. Pastikan payload orchestrator, pengaturan aplikasi, nama/bahasa template yang disetujui Meta, dan jumlah parameter konsisten sebelum pengiriman nyata.

Parameter body template penyelesaian, dalam urutan kode:

1. Nama wasit.
2. Nama event.
3. Label peran penugasan.

Payload penyelesaian tidak memasukkan parameter tombol URL. Tautan `/referee/honor` harus cocok dengan template yang disetujui atau ditambahkan melalui konfigurasi template yang benar; jangan mengklaim URL otomatis berasal dari payload sekarang.

### 9.3 Environment penyelesaian

- `WHATSAPP_ACCESS_TOKEN`.
- `WHATSAPP_PHONE_NUMBER_ID`.
- `WHATSAPP_API_VERSION`; fallback kode `v23.0`.

Token hanya boleh berada di penyimpanan rahasia server. Versi Graph API harus diperiksa terhadap dukungan provider saat deployment; fallback bukan jaminan masa dukung.

### 9.4 Status monitoring

`WhatsAppDeliveryStatus`:

```typescript
type WhatsAppDeliveryStatus =
  "sent" | "pending" | "failed" | "skipped" | "not_sent";
```

Normalisasi UI menggabungkan `sent`, `delivered`, dan `read` menjadi `sent`. Karena itu label **Terkirim tidak membuktikan dibaca** dan tidak membedakan penerimaan provider dari delivery akhir.

Ringkasan:

- `total`: jumlah item.
- `sent`: status sent hasil normalisasi.
- `pending`: menunggu.
- `failed`: gagal.
- `skipped`: termasuk skipped dan not_sent pada perhitungan ringkasan.
- `needsAttention = failed + skipped`.

Sumber data: `assignment_notifications`, `event_completion_notifications`, profil, kontak wasit, dan penugasan. Urutan daftar mendahulukan failed, skipped, not_sent, pending, lalu sent.

### 9.5 Kode kendala

| Kode | Tindak lanjut |
|---|---|
| `WHATSAPP_CONTACT_MISSING` | Lengkapi/perbaiki nomor wasit |
| `WHATSAPP_NOT_CONFIGURED` | Periksa pengaturan dan rahasia server |
| `WHATSAPP_DELIVERY_FAILED` | Periksa template, nomor, izin akun, dan respons provider |
| `WHATSAPP_NETWORK_ERROR` | Coba ulang setelah gangguan jaringan pulih |

### 9.6 Retry

Task `event-whatsapp-status`, `action: "retry"`:

- Assignment: memverifikasi assignment milik event; menghapus claim WhatsApp, mengubah status ke pending, memanggil orchestrator.
- Completion: mereset claim target lalu menjalankan dispatch event.
- Respons akhir memuat daftar dan ringkasan terbaru.

Batas yang harus dipertimbangkan:

- Dispatch completion berjalan pada level event, bukan fungsi pengiriman satu baris saja.
- Beberapa hasil update/invoke tidak diperiksa eksplisit.
- Reset claim dapat berisiko jika pengiriman lain masih berlangsung.
- Belum ada jaminan retry backoff, rate limit, dan audit retry lengkap dari komponen ini saja.
- Item completion baru ditampilkan jika baris completion sudah ada; event yang sama sekali gagal dispatch dapat kehilangan indikator completion.

### 9.7 Webhook dan pengiriman manual

Receiver publik Meta dan Kirisan sudah ada. Verifikasi signature/token wajib di handler. Bukti keberadaan receiver tidak sama dengan webhook provider telah terpasang dan status telah tersinkronisasi end-to-end.

Tombol `WA Manual` membuka `wa.me`. Itu bantuan operator, bukan pengiriman terukur dari aplikasi dan bukan bukti status provider otomatis diperbarui.

## 10. Model Data dan RPC

### 10.1 Inventori berdasarkan tipe yang dihasilkan

`src/integrations/supabase/types.ts` mendeklarasikan **36 tabel, 5 view, dan 48 fungsi RPC**. Angka ini bukan hasil introspeksi database live pada sesi ini. Dokumentasi terdahulu yang menyebut 41 tabel mencampur tabel dan view; angka 46 RPC tidak sesuai inventori tipe terkini.

### 10.2 Tabel per domain

| Domain | Tabel |
|---|---|
| Identitas dan wilayah | `profiles`, `user_roles`, `provinsi`, `kabupaten_kota`, `referee_contacts` |
| Event | `events`, `event_assignments`, `event_approvals`, `event_logs` |
| Honor | `honors` |
| Notifikasi | `notifications`, `notification_preferences`, `assignment_notifications`, `event_completion_notifications`, `notification_channel_claims` |
| Provider dan ledger | `message_delivery_ledger`, `meta_webhook_events`, `private_whatsapp_settings` |
| Kartu/dokumen | `referee_cards`, `card_verification_logs`, `issued_documents` |
| Evaluasi/review | `evaluations`, `evaluation_criteria`, `evaluation_scores`, `referee_reviews` |
| Pembelajaran | `learning_materials`, `learning_progress` |
| Diskusi | `discussion_topics`, `discussion_replies` |
| Organisasi | `pengurus` |
| Pengaturan | `system_settings`, `public_application_settings` |
| Audit/autentikasi | `activity_logs`, `audit_logs`, `auth_attempts`, `auth_event_logs` |

### 10.3 View

`active_events`, `active_honors`, `public_system_settings`, `public_whatsapp_settings`, `referee_review_stats`.

View berlabel public tidak otomatis boleh mengekspos setiap kolom sumber. Periksa definisi, GRANT, dan perilaku RLS sebelum mengubahnya.

### 10.4 Relasi konseptual

```text
profiles → user_roles
profiles → referee_contacts / referee_cards
profiles → kabupaten_kota → provinsi
profiles (creator) → events
 events → event_assignments → profiles (referee)
 events → event_approvals
 events → honors → profiles (referee)
 event_assignments → assignment_notifications / notification_channel_claims
 events + profiles → event_completion_notifications
 profiles → evaluations / learning_progress / discussion_topics
```

Diagram konseptual bukan DDL. Foreign key dan cardinality yang sebenarnya harus dibaca pada SQL dan generated types. Jangan menambahkan foreign key ke skema auth secara sembarang.

### 10.5 Inventori RPC

**Registrasi:** `approve_registration`, `reject_registration`, `can_approve_registration`, `get_pending_registrations`, `get_registration_history`.

**Peran/wilayah:** `has_role`, `has_any_app_role`, `is_admin`, `is_admin_provinsi`, `is_admin_kab_kota`, `is_same_region`, `can_access_region`, `get_accessible_regions`, `get_user_kabupaten_kota`, `get_user_kabupaten_kota_id`.

**Event/penugasan:** `check_duplicate_event`, `check_event_schedule_conflict`, `get_booked_event_dates`, `has_schedule_conflict`, `is_event_approved`, `mark_event_completed`, `transition_event_assignment_status`.

**Idempotensi:** `claim_notification_channel`, `finalize_notification_channel`, `claim_event_completion_notification`, `finalize_event_completion_notification`.

**Wasit/statistik:** `count_referees`, `get_referees`, `get_public_referee`, `get_public_referees`, `is_referee_active`, `get_referee_event_count`, `get_my_referee_event_count`, `get_honor_statistics`, `get_referee_income_summary`, `get_admin_dashboard_summary`.

**Kartu:** `auto_mark_expired_cards`, `count_referee_cards`, `generate_card_number`, `issue_my_referee_card`, `regenerate_my_referee_card`, `verify_referee_card`.

**Dokumen:** `generate_official_document_number`, `issue_official_document`, `revoke_official_document`, `verify_official_document`.

**Audit/diskusi:** `get_audit_logs`, `increment_view_count`.

### 10.6 Riwayat migrasi yang ada

- `0000_import_base_schema.sql`.
- `0001_import_schema_part_2.sql`.
- `0002_replace_with_production_schema.sql`.
- `0003_apply_post_baseline_source_migrations.sql`.
- `0004_add_missing_app_actions.sql`.
- `0005_link_event_approvals_to_events.sql`.
- `0006_fix_event_approval_logging.sql`.
- `0007_harden_selected_rls_and_storage_policies.sql`.
- `0008_tighten_panitia_and_regional_event_rls.sql`.
- `0009_add_event_region_booking_lock.sql`.

Jangan menjalankan ulang migrasi import/replace pada database produksi tanpa membaca isi dan menguji restorasi. Keberadaan arsip SQL bukan jaminan portable provisioning satu perintah.

## 11. Peta Halaman

| Kelompok | Path utama |
|---|---|
| Publik | `/`, `/verify/$code`, `/review`, `/review/$id`, `/review/$id/detail`, `/review/success` |
| Akun | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/pending-approval`, `/profile/complete` |
| Dashboard | `/dashboard`, `/analytics`, `/notifications` |
| Event | `/events`, `/events/calendar`, `/events/submit`, `/events/$id`, `/events/$id/edit`, `/events/$id/assign-referees`, `/approvals` |
| Wasit | `/referees`, `/referees/$id`, `/referee`, `/referee/events`, `/referee/honor`, `/referee/id-card`, `/referee/profile`, `/referee/profile/complete` |
| Evaluasi | `/evaluations`, `/evaluations/new`, `/evaluations/$id` |
| Pembelajaran | `/admin/learning`, `/referee/learning`, `/referee/learning/$id` |
| Diskusi | `/admin/discussions`, `/referee/discussions`, `/referee/discussions/new`, `/referee/discussions/$id` |
| Administrasi | `/users`, `/user-approvals`, `/organization`, `/settings`, `/audit-logs`, `/admin/auth-logs`, `/admin/honor`, `/admin/id-cards`, `/administration/event-assignments` |
| Laporan | `/reports/annual`, `/reports/event-analytics`, `/reports/referee-performance`, `/export` |

Peta path adalah inventori, bukan matriks izin lengkap. Periksa `ProtectedRoute` dan RLS untuk setiap halaman. Jangan menambahkan tautan ke path yang belum mempunyai file route.

Homepage menampilkan kalender publik melalui `PublicEventCalendar`, `usePublicEvents`, dan helper `publicCalendar`. Riwayat selesai dapat tetap terlihat walaupun slot booking sudah dilepas.

## 12. Kontrak Layanan Server

### 12.1 Caller browser

```typescript
const { data, error } = await invokeServerTask("event-whatsapp-status", {
  body: { eventId, action: "list" },
});
if (error) {
  // Tampilkan keadaan gagal; jangan menganggap data berhasil tersedia.
}
```

Helper:

- Menambahkan bearer token dari sesi aktif bila header belum disediakan.
- Mengirim ke `/api/functions/{name}` dengan metode default POST.
- Mendukung body JSON, string, FormData, Blob, dan ArrayBuffer.
- Mengembalikan `{ data, error }`.
- Error HTTP direpresentasikan `ServerTaskError` dengan `status` dan `context`.
- Kegagalan jaringan dapat melempar exception; tangani kedua bentuk error.

### 12.2 Dispatcher

`src/routes/api/functions.$name.ts` memeriksa bearer token dan memvalidasi pengguna sebelum memanggil registry. Autentikasi dispatcher hanya membuktikan identitas; otorisasi domain tetap tanggung jawab handler.

Pemanggilan task-ke-task oleh adaptor runtime berjalan in-process melalui registry. Jangan menganggap pemanggilan internal selalu melewati HTTP dispatcher; handler harus mempertahankan validasi caller dan peran sendiri.

### 12.3 Task terdaftar

```text
admin-reports                       auto-complete-events
create-user                         create-users-bulk
delete-user                         export-database
event-whatsapp-status               generate-report-pdf
import-database                     notification-orchestrator
reset-user-password                 seed-database
send-assignment-notification        send-event-completion-notification
send-event-notification             send-event-reminders
send-license-reminder               send-profile-reminder
send-whatsapp                       test-email-config
test-whatsapp-config                update-application-settings
update-user-email                   upsert-whatsapp-config
```

Webhook registry terpisah: `kirisan-webhook`, `meta-whatsapp-webhook`.

Task dengan nama seed/import/export/delete sangat sensitif; keberadaan handler bukan izin pemanggilan untuk semua pengguna.

### 12.4 Monitoring WhatsApp

Permintaan list:

```json
{ "eventId": "UUID-event", "action": "list" }
```

Retry assignment:

```json
{
  "eventId": "UUID-event",
  "action": "retry",
  "notificationType": "assignment",
  "assignmentId": "UUID-penugasan"
}
```

Retry completion:

```json
{
  "eventId": "UUID-event",
  "action": "retry",
  "notificationType": "completion",
  "refereeId": "UUID-wasit"
}
```

Nilai `UUID-*` adalah penjelasan placeholder, bukan UUID valid untuk eksekusi.

Respons berhasil memuat `success`, `eventId`, `summary`, dan `items`. Status kegagalan utama: 400 payload, 401 sesi, 403 hak/wilayah, 404 event/penugasan, 405 metode, 500 error server. Dispatch completion dapat memberi 409 bila event belum selesai.

## 13. Keamanan dan Perlindungan Data

### 13.1 Aturan wajib

- Peran berasal dari tabel terlindungi `user_roles`, bukan metadata yang dapat diubah pengguna.
- Aktifkan RLS dan GRANT yang sesuai pada setiap tabel aplikasi.
- Jangan memakai klien privileged untuk pembacaan biasa atau menentukan izin pengguna tanpa pemeriksaan peran.
- Jangan memasukkan token provider, sesi, password, dan nilai rahasia ke log atau repositori.
- Generated client dan file integrasi yang dihasilkan platform tidak diedit manual selama proyek tetap terhubung.
- Jangan mengubah tabel/skema auth, storage, atau sistem terkelola sembarangan.
- Public endpoint memvalidasi caller provider sendiri; prefix public melewati autentikasi situs.
- Gunakan UUID validation, cek keberadaan objek, hubungan assignment-event, dan scope wilayah.

### 13.2 Foto profil

Bucket avatar privat, tetapi route avatar menyediakan akses terbatas agar foto dapat muncul pada halaman publik. Perubahan route harus menjaga batas path, MIME, dan objek yang boleh dibaca. Jangan membuat seluruh bucket publik sebagai jalan pintas.

### 13.3 Kunci opaque

Adaptor runtime menangani publishable/secret key opaque dengan mengirim header `apikey`, bukan memperlakukan kunci tersebut sebagai bearer JWT. Sesi pengguna tetap memakai bearer access token. Menggabungkan keduanya akan menyebabkan kegagalan autentikasi.

### 13.4 Audit

Pisahkan aktivitas operasional, audit perubahan, log autentikasi, log provider, dan error aplikasi. Simpan actor, entity, timestamp, dan hasil operasi; jangan simpan token mentah. Kebijakan retensi dan masking data pribadi perlu ditetapkan sebelum penggunaan skala besar.

## 14. Menjalankan Proyek di Luar Lovable

### 14.1 Persiapan

1. Ambil source dari repositori resmi beserta lockfile.
2. Baca `AGENTS.md` sebelum mengubah kode.
3. Gunakan runtime Node yang kompatibel dengan Vite terpasang; jangan mengasumsikan seluruh versi Node 20 didukung.
4. Gunakan satu package manager secara konsisten. Repositori saat ini mempunyai `bun.lock`.
5. Siapkan akses konfigurasi publik dan environment server melalui mekanisme resmi pemilik proyek.
6. Jangan menyalin `.env` rahasia ke dokumentasi, issue, atau prompt AI.

### 14.2 Perintah dasar

```bash
bun install --frozen-lockfile
bun run dev
bun run test
bun run lint
bun run build
```

Alternatif npm mengikuti script manifest, tetapi jangan membuat lockfile paralel tanpa keputusan tim.

Build produksi dijalankan di lingkungan pengembangan/CI mandiri. Di editor Lovable, build preview dikelola platform.

### 14.3 Pemetaan konfigurasi tanpa nilai rahasia

| Identifier | Penggunaan | Perlindungan |
|---|---|---|
| `VITE_SUPABASE_URL` | Endpoint klien database/auth | Konfigurasi publik; tidak perlu dicetak di dokumen |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Klien browser | Kunci publik, tetap bergantung RLS |
| `VITE_SUPABASE_PROJECT_ID` | Identitas integrasi browser | Dikelola platform |
| `SUPABASE_URL` | Handler warisan | Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Handler privileged warisan | Rahasia server; tidak tersedia untuk diambil pengguna dari Lovable Cloud |
| `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` | Alias adaptor runtime | Konfigurasi klien server sesuai tujuan |
| `WHATSAPP_ACCESS_TOKEN` | Dispatch penyelesaian Meta | Rahasia server |
| `WHATSAPP_PHONE_NUMBER_ID` | Identitas nomor provider | Pengaturan server |
| `WHATSAPP_API_VERSION` | Versi Graph API | Pengaturan server |

Nama identifier dicantumkan untuk kompatibilitas source; **tidak ada nilai kredensial dalam dokumen ini**. Jangan memalsukan service credential atau menganggap dapat mengekspornya dari Cloud.

### 14.4 Hal yang belum otomatis portable

- Modul generated server client dan binding runtime.
- Pengaturan provider autentikasi, email redirect, dan URL aplikasi.
- Scheduler, webhook provider, secrets, dan storage.
- Skema auth/storage serta kebijakan akses terkait.
- Deployment adapter yang disediakan konfigurasi Lovable.

Aplikasi dev yang berjalan bukan bukti SSR dan handler berjalan pada Worker produksi.

## 15. Strategi Pemindahan Infrastruktur

Pilih secara eksplisit salah satu pendekatan:

### A. Source dikembangkan mandiri, Cloud tetap dipakai

- Pertahankan skema, RLS, dan integrasi yang dikelola platform.
- Koordinasikan perubahan database melalui mekanisme Lovable yang didukung.
- Pastikan environment mandiri mempunyai akses server yang sah; jangan mengarang service key.
- Uji CORS, URL redirect, endpoint webhook, dan origin aplikasi.

### B. Aplikasi dan backend dipindahkan ke infrastruktur baru

1. Tentukan target yang mendukung PostgreSQL, autentikasi, storage, dan runtime server.
2. Ambil ekspor skema/data yang tersedia melalui mekanisme resmi; verifikasi bahwa fungsi, trigger, kebijakan, grants, dan storage termasuk.
3. Audit migrasi sebelum menjalankannya pada database kosong.
4. Rebuild integrasi client dan model autentikasi pada target secara eksplisit.
5. Rancang migrasi akun/password atau reset akun; jangan menjanjikan sesi lama dapat dipindahkan otomatis.
6. Salin file storage dan pertahankan ownership/path yang sah.
7. Buat rahasia baru pada target, bukan mengekstrak rahasia managed Cloud.
8. Ganti URL redirect, public app URL, template tautan, dan webhook provider.
9. Uji peran, RLS, booking konkuren, completion, honor, dan callback provider.
10. Lakukan cutover dengan backup, waktu freeze penulisan, rekonsiliasi, dan rollback yang telah diuji.

Dokumentasi ini bukan paket migrasi lengkap atau jaminan ekspor seluruh komponen Cloud. Jangan mengubah target runtime/router/database dalam pekerjaan fitur biasa.

## 16. Standar Pengembangan

### 16.1 Routing

- Gunakan TanStack Router; jangan memasang React Router DOM atau membuat `App.tsx` page switcher.
- Gunakan shim navigasi untuk halaman porting yang sudah menggunakannya.
- Jangan mengedit `routeTree.gen.ts` manual.
- Route parent wajib mempunyai `Outlet`.
- Halaman baru perlu metadata judul dan deskripsi sendiri; jangan mengandalkan root untuk seluruh halaman.

### 16.2 Data dan server

- Pertahankan hook/query key domain agar invalidasi konsisten.
- Fitur baru dengan initial read dapat memakai loader dan queryOptions sesuai pola TanStack; jangan merombak seluruh hook lama sebagai bagian perubahan kecil.
- Logika internal baru mengikuti `createServerFn` dan autentikasi yang sesuai; legacy task tetap menggunakan registry yang ada bila pekerjaan hanya memodifikasi task warisan.
- Webhook/external callback memakai server route public dengan verifikasi internal.
- Jangan membuat fungsi backend Deno baru yang terpisah dari runtime aplikasi.

### 16.3 TypeScript

- Hapus `@ts-nocheck` secara bertahap saat menyentuh file, setelah error tipe ditangani.
- Inventori pencarian saat dokumentasi menunjukkan 56 kemunculan `@ts-nocheck`; jumlah bukan ukuran kualitas runtime.
- Jangan menyembunyikan route yang hilang atau otorisasi tidak jelas dengan cast `any`.
- Tambahkan tipe request/response dan validasi runtime untuk input eksternal.

### 16.4 UI

- Gunakan komponen design system dan token semantik di `styles.css`.
- Hindari warna hardcoded yang melewati theme.
- Pertahankan pengalaman mobile, keadaan loading/error/empty, dan aksesibilitas kontrol.
- Perubahan tampilan tidak boleh mengubah aturan izin atau status bisnis diam-diam.

## 17. Pengujian dan Kriteria Penerimaan

### 17.1 Baseline terukur

Pada 27 November 2026, `bunx vitest run` menghasilkan:

```text
Test Files: 36 passed
Tests:      150 passed
```

Tes mencakup auth repositories, izin event, booking helper, kalender publik, WhatsApp sender/security/status, kontrak penyelesaian event, dokumen, kartu, dan sejumlah kontrak halaman.

Sebagian tes kontrak memeriksa source atau pola implementasi. Lulus unit test tidak membuktikan RLS live, delivery provider, atau flow pengguna end-to-end.

### 17.2 Skenario wajib sebelum rilis perubahan

| Skenario | Hasil yang diharapkan |
|---|---|
| Panitia membuka approval/assignment atau memanggil API langsung | Ditolak |
| Admin Kabupaten A approve/assign event Kabupaten B | Ditolak oleh server/database |
| Admin Provinsi buat event | Dapat memilih wilayah operasional, status awal disetujui |
| Dua event aktif sama wilayah dan tanggal | Event kedua ditolak |
| Dua event berbeda wilayah tanggal sama | Tidak konflik booking |
| Rentang A 1–3 dan B 3–5 | Konflik pada tanggal 3 |
| Edit tanpa perubahan rentang | Tidak konflik dengan dirinya sendiri |
| Dua transaksi booking simultan satu wilayah | Maksimal satu booking berhasil |
| Event selesai dengan assignment confirmed | Draft honor dibuat bila belum ada |
| Assignment cancelled/declined | Tidak diperlakukan sebagai confirmed |
| Draft bernominal 0 | Dapat diisi lalu diajukan sesuai validasi |
| Nomor WA kosong | Skipped dengan kode kontak |
| Provider menolak | Failed, terlihat di monitoring |
| Retry oleh admin wilayah lain | Ditolak |
| Webhook signature invalid | Ditolak tanpa mutasi data |
| Kalender publik | Tidak mengekspos kontak/honor/kunci |

### 17.3 Checklist verifikasi operasional

- Browser flow pada akun nyata/test untuk masing-masing peran.
- Dua event bentrok melalui UI dan database nyata.
- Nominal honor disimpan dan terbaca ulang.
- Template Meta disetujui dengan nama, bahasa, dan urutan parameter tepat.
- Message ID tercatat, webhook diterima, dan status gagal dapat ditindaklanjuti.
- Backup dipulihkan pada staging dan jumlah/relasi data diverifikasi.
- Build dan SSR pada runtime target, bukan hanya dev server.

## 18. Gap dan Roadmap

### 18.1 Gap prioritas berdasarkan kode yang ditelaah

| Prioritas | Gap | Rencana |
|---|---|---|
| P1 | Completion RPC dan dispatch terpisah; hasil error bisa tidak muncul ke operator | Outbox/reconciliation dan error eksplisit |
| P1 | Sumber konfigurasi WhatsApp assignment/completion berbeda | Kontrak konfigurasi bersama dan tes kedua jalur |
| P1 | Template penugasan default berbeda dari rancangan yang disetujui | Cocokkan template Meta, sender, orchestrator, dan pengaturan |
| P1 | Sent/delivered/read digabung di UI | Simpan status transport asli dan tampilkan delivery final terpisah |
| P1 | Retry reset claim tanpa bukti keamanan pengiriman konkuren | Lease/backoff, audit, dan tes konkurensi |
| P1 | Anti-duplikasi honor/in-app belum dibuktikan secara konkuren | Unique constraint dan transaksi yang sesuai |
| P2 | Scheduler nyata belum diverifikasi | Trigger terjadwal terautentikasi dan pemantauan eksekusi |
| P2 | Belum tersedia pengujian E2E menyeluruh | Skenario lima peran, booking, honor, dan provider |
| P2 | Dokumentasi dan ekspor backend belum menjadi paket pemindahan lengkap | Manifest skema, prosedur restore, staging migration |
| P3 | File warisan dengan type suppression | Refactor domain bertahap tanpa mengubah izin |

### 18.2 Rekomendasi lanjutan, bukan fitur yang telah dijanjikan selesai

- Rekonsiliasi otomatis notifikasi gagal dan event selesai yang belum memiliki draft.
- Delivery ledger yang mempertahankan sent/delivered/read/failed beserta timestamp.
- Laporan terpaginate dan ekspor PDF/Excel setelah kontrak angka ditetapkan.
- Observability operasional: durasi task, error rate provider, retry, dan scheduler.
- Audit cakupan wilayah pada seluruh modul selain event.
- PWA/offline hanya setelah konflik sinkronisasi dan data sensitif dirancang.

Tidak ada perubahan fitur yang dilakukan saat pembuatan dokumen ini.

## 19. Panduan untuk AI Coding

Gunakan arahan berikut saat menyerahkan proyek kepada alat AI lain:

```text
Anda mengembangkan aplikasi AFP Sulsel/APSSI Sulsel yang sudah ada.
Baca AGENTS.md dan TECHNICAL_DOCUMENTATION.md terlebih dahulu.
Pertahankan TanStack Start, TanStack Router, React, serta aturan wilayah.
Panitia tidak mempunyai hak approval atau penugasan wasit.
Admin Kabupaten/Kota hanya bertindak pada event di wilayahnya sendiri.
Admin Provinsi mempunyai kewenangan lintas wilayah operasional aplikasi.
Booking DIAJUKAN dan DISETUJUI menggunakan tanggal inklusif per wilayah.
Status event uppercase; honor lowercase; assignment mengikuti state machine aktual.
Jangan menambahkan bypass RLS, kredensial dalam source, atau bucket publik luas.
Jangan mengedit generated files dan sejarah migrasi yang sudah diterapkan.
Jangan memperlakukan status WA sent sebagai bukti delivered/read.
Implementasikan hanya scope permintaan, tambahkan tes aturan yang berubah,
dan bedakan hasil unit test dari hasil E2E/provider/database nyata.
Jika informasi operasional belum terverifikasi, tandai sebagai belum terverifikasi.
```

### 19.1 Format catatan perubahan

Setiap pekerjaan sebaiknya mencatat:

1. Tujuan dan batas scope.
2. File dan domain yang berubah.
3. Aturan bisnis yang dipertahankan/diubah dengan persetujuan.
4. Migrasi serta dampak data.
5. Tes yang dijalankan dan hasil konkret.
6. Bukti verifikasi alur pengguna.
7. Risiko, konfigurasi yang masih diperlukan, dan rollback.

## 20. Checklist Serah Terima

- [ ] Source lengkap dan commit baseline diketahui.
- [ ] Manifest dan lockfile tersedia.
- [ ] Aturan organisasi/nama resmi dikonfirmasi.
- [ ] Skema, trigger, RPC, RLS, GRANT, dan indeks diinventarisasi.
- [ ] Data contoh aman tersedia tanpa data pribadi produksi.
- [ ] Target runtime dan kebutuhan environment ditetapkan.
- [ ] Nilai rahasia dikirim lewat mekanisme aman, bukan dokumen ini.
- [ ] Template provider dan webhook diverifikasi.
- [ ] Scheduler dan pemantauan kegagalan dioperasikan.
- [ ] Akun uji peran tersedia.
- [ ] Booking konkuren, honor, dan retry diuji end-to-end.
- [ ] Backup, restore, cutover, dan rollback diuji.
- [ ] Daftar gap dibedakan dari fitur selesai.

---

## Sumber Rujukan

- `AGENTS.md`, `package.json`, dan lockfile.
- `src/routes/__root.tsx` dan inventori file route.
- `src/components/auth/ProtectedRoute.tsx`.
- `src/contexts/AuthContext.tsx` dan repositories auth.
- `src/lib/eventPermissions.ts`, `eventBooking.ts`, `publicCalendar.ts`, `whatsappStatus.ts`.
- `src/lib/server-tasks.ts` dan `src/server/edge-runtime.ts`.
- `src/server/edge/registry.ts`, `send-whatsapp.ts`, `send-event-completion-notification.ts`, `event-whatsapp-status.ts`.
- `src/hooks/useEvents.ts` dan hook domain terkait.
- `src/integrations/supabase/types.ts`.
- `drizzle/migrations/0000` sampai `0009`.
- Hasil eksekusi Vitest pada sesi dokumentasi.

**Pemeliharaan:** perbarui dokumen ketika aturan peran, model status, konfigurasi provider, skema, atau target deployment berubah; jangan menjadikan dokumentasi lama sebagai alasan mengabaikan constraint dan perilaku kode aktual.
