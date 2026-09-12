# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

# Admin kuryer (hub) — o'zgarishlar

## Nima qiladi
1. Sotuvchi buyurtmani `packing` holatiga o'tkazganda buyurtma **faqat admin kuryer** panelida chiqadi.
2. Admin kuryer **"Qabul + chek + kuryerga"** bosadi:
   - hub-check yoziladi (`admin_courier_checked_at`)
   - chek (nakladnoy) avtomatik print oynasida ochiladi
   - buyurtma **oddiy kuryerlar** "Yangi takliflar" ro'yxatiga tushadi
3. Oddiy kuryer faqat hubdan o'tgan buyurtmani qabul qila oladi va yetkazadi.
4. Admin kuryer **bitta** bo'ladi, telefon orqali OTP bilan kiradi.

## Demo login
- Admin kuryer telefon: **+998906666666**
- Oddiy kuryer (mavjud): **+998902222222**
- OTP: backend demo rejimida `send-otp` javobidagi `demo_code`

## Fayllarni joylash
| Fayl | Loyihadagi joy |
|------|----------------|
| `server.py` | Backend asosiy FastAPI fayli (sizdagi `pasted-text` / `server.py`) |
| `courier.tsx` | `app/courier.tsx` |
| `roleRoute.ts` | `src/lib/roleRoute.ts` |

## API
- `GET /api/courier/available` — role ga qarab turli filter
- `POST /api/courier/orders/{id}/hub-check` — faqat admin kuryer
- `GET /api/courier/hub-queue` — waiting + released
- `GET /api/courier/me-flags` — `{ is_admin_courier }`
- `POST /api/admin/couriers` body ga `is_admin_courier: true` (faqat bitta)

## Mavjud DB
Server startida `ensure_admin_courier_account` +998906666666 ni yaratadi yoki promote qiladi.
Agar boshqa raqam kerak bo'lsa, MongoDB da:
```
db.users.updateOne(
  { phone: "+9989XXXXXXXX" },
  { $set: { role: "admin_courier", "courier_info.is_admin_courier": true } }
)
```
