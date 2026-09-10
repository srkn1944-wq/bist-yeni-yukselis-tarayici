# BIST Yeni Yükseliş Tarayıcı

TradingView harici çalışan Node.js + web paneli.

## Ana ekran sırası
1. Yeni Yükseliş
2. Hacim Patlaması
3. Güçlü AL
4. Günün Yükselenleri
5. Günün Düşenleri

## Yeni Yükseliş Puanı
- Hacim artışı: 30 puan
- Yeni trend kırılımı: 25 puan
- Momentum pozitife geçiş: 15 puan
- RSI 50 geçişi: 10 puan
- Alış baskısı: 10 puan
- ADX: 10 puan

+%5 üstüne gitmiş hisseler yeni-yükseliş etiketi yerine daha geç evre kabul edilir.

## Çalıştırma
npm install
npm start

Ardından http://localhost:3000

## Önemli
Varsayılan veri kaynağı Yahoo Finance'in genel chart uç noktasıdır ve resmi BIST lisanslı gerçek-zaman veri servisi değildir.
Veri gecikmeli olabilir, kota/erişim değişebilir. Üretim kullanımında lisanslı BIST veri API'si önerilir.

symbols.json içine yeni BIST sembolleri eklenebilir. Kod otomatik olarak sembole `.IS` ekler.
