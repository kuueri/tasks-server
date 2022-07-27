## Kuueri Tasks Server
*Path version* `/v1beta/**`


### Definisi
**Kuueri Tasks** adalah layanan eksekusi terkelola untuk kebutuhan pengiriman atau distribusi tugas. Secara teknis, *Task* merupakan sebuah objek yang merepresentasikan sebuah sumber eksekusi sekali pakai. Kamu dapat melakukan permintaan tugas ke **Kuueri Tasks** yang kemudian akan dieksekusi diwaktu kedepan. Selama kamu mempunyai layanan API, **Kuueri Tasks** akan mengeksekusi dan mengirimkan tugasnya ke URL target yang sudah ditentukan.

```
Your app                        Tasks server                Target server

[TASK] ------(subscribe)------> [QUEUE] ------(http)------> [SERVER]
                                [QUEUE] <------------------ [SERVER]
```

Perlu diperhatikan bahwa, **Kuueri Tasks** menggunakan **Redis** sebagai database untuk menyimpan riwayat data eksekusi. Secara default, riwayat data eksekusi disimpan sementara selama 3 hari. Gunakan layanan kamu sendiri untuk menyimpan riwayat data eksekusi tersebut secara permanen.


### Struktur dan Tipe Data
Berikut adalah struktur dan tipe data yang digunakan **Kuueri Tasks**:
1. **Kuueri Tasks** menggunakan tipe data [List](https://redis.io/docs/manual/data-types/#lists), [Sets](https://redis.io/docs/manual/data-types/#sets), dan [Hashes](https://redis.io/docs/manual/data-types/#hashes)
2. **Kuueri Tasks** menggunakan `0~3` *index* database
    - *index* `0` menyimpan data terkait *authorization*
    - *index* `1` menyimpan data terkait eksekusi
    - *index* `2` menyimpan data terkait konfigurasi eksekusi
    - *index* `3` menyimpan data terkait *timeline* eksekusi
3. **Kuueri Tasks** mengoptimalkan proses CRUD dengan menggunakan [Redis Pipelining](https://redis.io/docs/manual/pipelining/)
4. **Kuueri Tasks** mengaktifkan fitur [Snapshotting](https://github.com/redis/redis/blob/6.2.7/redis.conf#L362) pada **Redis** sebagai backup
```
save 3600 1
save 300 100
save 60 10000
```


### Fitur
1. *HTTP target*
    - Mengeksekusi menggunakan HTTP API
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
    - buat file `redis.conf` di `./resource/config/` - *required*
3. `npm run build`
4. Install **Kuueri Tasks** dan **Redis** `docker-compose -f ./docker-compose.yml up -d`. Gunakan `/bin/sh` untuk masuk ke OS
5. Proses registrasi ke `/[VERSION]/register` `POST` masukkan body `{ email: [YOUR EMAIL] }`
6. Atur permintaan *headers*
    - buat *headers* `authorization: Bearer [TOKEN]`
    - buat *headers* `x-kuueri-tasks-project: [PROJECT ID]`

INFO: `npm run dev` untuk proses *development*

### Langkah Lanjutan
Terdapat dependensi tambahan `@google-cloud/secret-manager` pada **Kuueri Tasks Server** dengan tujuan ketika masuk ke level *production*, file `config.json` akan disimpan ke dalam [Cloud Secret Manager](https://cloud.google.com/secret-manager). Cara ini akan jauh lebih aman karena file `config.json` tidak berada disisi server. Untuk memulai menggunakan layanan **Cloud Secret Manager**, pastikan kamu sudah menambahkan *principal* pada nama *Secret* dengan *Service Account* yang terhubung *role* sebagai *Secret Manager Secret Accessor*. Simpan file `service-account.json` dimanapun dan buat file `.docker.env`.

***Jika **Kuueri Tasks Server** di deploy ke VM, abaikan `.docker.env` masukkan `TASKS_KEY_FILENAME` dan `TASKS_VERSION` ke dalam `~/.bashrc`


### Dokumentasi *API Reference*
*Project module*:
- `/[VERSION]/info` **`GET`** - Mendapatkan info *project*
- `/[VERSION]/register` **`POST`** - Registrasi **Kuueri Tasks** *project*

*Subscription module*:
- `/[VERSION]/queues/[QUEUE ID]` **`GET`** - Mendapatkan informasi eksekusi
- `/[VERSION]/queues/[QUEUE ID]` **`DELETE`** - Menghapus riwayat informasi eksekusi
- `/[VERSION]/queues/[QUEUE ID]/timeline` **`GET`** - Mendapatkan informasi *timeline* eksekusi
- `/[VERSION]/subscribe` **`POST`** - Registrasi eksekusi
- `/[VERSION]/pause/[QUEUE ID]` **`PATCH`** - Memberhentikan sejenak eksekusi
- `/[VERSION]/resume/[QUEUE ID]` **`PATCH`** - Melanjutkan eksekusi
- `/[VERSION]/unsubscribe/[QUEUE ID]` **`PATCH`** - Membatalkan eksekusi

***Untuk dokumentasi selanjutnya masih dalam proses...


### Ekosistem
1. Kuueri Tasks Server
2. Kuueri Tasks WebAppTesting - *soon*


### Catatan Penting
1. Setiap permintaan ke **Kuueri Tasks** terdapat proses *authorization*. Jangan lakukan permintaan dari sisi *client/frontend*
2. Secara default, terdapat limitasi panjang antrian *(task in queue)* sebanyak `1000`
3. Ketika masuk ke **Redis** database, hindari permintaan seperti: `FLUSHALL` `FLUSHDB` `SHUTDOWN` `CONFIG` `BGREWRITEAOF` `BGSAVE` `RENAME` `DEBUG`. Gunakan [Redis ACL](https://redis.io/docs/manual/security/acl/) untuk mengatur *role user*


### Lisensi
*Copyright (c) Kuueri Tasks Server under the MIT License*.
