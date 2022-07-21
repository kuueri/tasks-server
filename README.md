<div align="center">
  <h1>Kuueri Tasks Server</h1>
</div>


### Definisi
**Kuueri Tasks** adalah layanan eksekusi terkelola untuk kebutuhan pengiriman atau distribusi tugas. Secara teknis, *Task* merupakan sebuah objek yang merepresentasikan sebuah sumber eksekusi sekali pakai. Kamu dapat melakukan permintaan tugas ke **Kuueri Tasks** yang kemudian akan dieksekusi diwaktu kedepan. Selama kamu mempunyai layanan API, **Kuueri Tasks** akan mengeksekusi dan mengirimkan tugasnya ke URL target yang sudah ditentukan.

```
Your app                        Tasks server                Target server

[TASK] ------(subscribe)------> [QUEUE] ------(http)------> [SERVER]
                                [QUEUE] <------------------ [SERVER]
```

Perlu diperhatikan bahwa, **Kuueri Tasks** menggunakan **Redis** sebagai database untuk menyimpan riwayat data eksekusi. Secara default, riwayat data eksekusi disimpan secara sementara selama 3 hari. Gunakan layanan kamu sendiri untuk menyimpan riwayat data eksekusi tersebut secara permanen.


### Struktur dan Tipe Data
Berikut adalah struktur dan tipe data yang digunakan **Kuueri Tasks**:
1. **Kuueri Tasks** menggunakan tipe data [List](https://redis.io/docs/manual/data-types/#lists), [Sets](https://redis.io/docs/manual/data-types/#sets), dan [Hashes](https://redis.io/docs/manual/data-types/#hashes)
2. **Kuueri Tasks** menggunakan `0~3` index database
    - *index* `0` menyimpan data terkait *authorization*
    - *index* `1` menyimpan data terkait eksekusi
    - *index* `2` menyimpan data terkait konfigurasi eksekusi
    - *index* `3` menyimpan data terkait *timeline* eksekusi
3. **Kuueri Tasks** mengoptimalkan proses CRUD dengan menggunakan [Redis Pipelining](https://redis.io/docs/manual/pipelining/)
4. Gunakan fitur [Snapshotting](https://github.com/redis/redis/blob/6.2.7/redis.conf#L362) pada Redis sebagai backup
```
save 3600 1
save 300 100
save 60 10000
```
5. Untuk saat ini, **Kuueri Tasks** belum mendukung *multiple instance* dan hanya menggunakan 1 core CPU ketika di deploy


### Fitur
1. *HTTP target*
    - Mengksekusi menggunakan HTTP API
2. *Retry/Repeat mechanism*
    - *Retry*: Mengeksekusi kembali ketika mendapatkan respon error
    - *Repeat*: Mengeksekusi kembali ketika mendapatkan respon sukses
3. *Scheduling*
    - Atur eksekusi *delay* hingga eksekusi diwaktu tertentu


### Teknologi
- [NestJS v8](https://github.com/nestjs/nest/tree/v8.4.7)
- [Redis v6](https://github.com/redis/redis/tree/6.2.7)


### Langkah Memulai
1. `npm install`
2. Atur konfigurasi
    - buat file `config.json` di `./resource/config/` - *required*
    - buat file `redis.conf` di `./resource/config/` - *optional*
3. Install **Redis** `docker-compose -f ./docker-compose.yml up -d`. Gunakan `/bin/sh` untuk masuk ke OS
4. Proses *development* `npm run dev`. Untuk proses *build* `npm run build`
5. Proses registrasi ke `/v1beta/register` dengan method `POST` dan masukkan body `{ email: [YOUR EMAIL] }`
6. Proses *authorization*
    - buat header `authorization: Bearer [TOKEN]`
    - buat header `x-kuueri-tasks-project: [PROJECT ID]`


### Langkah Lanjutan
Terdapat dependensi tambahan `@google-cloud/secret-manager` pada **Kuueri Tasks Server** dengan tujuan ketika masuk ke level *production*, file `config.json` akan disimpan ke dalam [Cloud Secret Manager](https://cloud.google.com/secret-manager). Cara ini akan jauh lebih aman karena file `config.json` tidak berada disisi server. Untuk memulai menggunakan layanan **Cloud Secret Manager**, pastikan kamu sudah menambahkan *principal* pada nama *Secret* dengan *Service Account* yang terhubung *role* sebagai *Secret Manager Secret Accessor*. Simpan file `service-account.json` dimanapun dan buat file `.docker.env`.

***Jika **Kuueri Tasks Server** di deploy ke VM, abaikan `.docker.env` masukkan `TASKS_KEY_FILENAME` dan `TASKS_VERSION` ke dalam `.bashrc`


### Dokumentasi dan *API Reference*
Versi saat ini `/v1beta`

*Project module*:
- `/:version/info` **`GET`** - Mendapatkan info projek
- `/:version/register` **`POST`** - Registrasi **Kuueri Tasks** projek

*Subscription module*:
- `/:version/queues/:id` **`GET`** - Mendapatkan informasi eksekusi
- `/:version/queues/:id` **`DELETE`** - Menghapus riwayat informasi eksekusi
- `/:version/queues/:id/timeline` **`GET`** - Mendapatkan informasi *timeline* eksekusi
- `/:version/subscribe` **`POST`** - Registrasi eksekusi
- `/:version/pause/:id` **`PATCH`** - Berhenti sejenak eksekusi
- `/:version/resume/:id` **`PATCH`** - Melanjutkan eksekusi
- `/:version/unsubscribe/:id` **`PATCH`** - Membatalkan eksekusi

***Untuk dokumentasi selanjutnya masih dalam proses...


### Ekosistem
1. Kuueri Tasks Server
2. Kuueri Tasks Client-Testing (*soon*)


### Lisensi
*Copyright (c) Kuueri Tasks Server under the MIT License*.
