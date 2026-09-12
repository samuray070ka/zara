import React, { createContext, useContext, useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";

export type Lang = "uz" | "ru" | "en";

const dict: Record<string, Record<Lang, string>> = {
  home: { uz: "Bosh sahifa", ru: "Главная", en: "Home" },
  catalog: { uz: "Katalog", ru: "Каталог", en: "Catalog" },
  cart: { uz: "Savat", ru: "Корзина", en: "Cart" },
  orders: { uz: "Buyurtmalar", ru: "Заказы", en: "Orders" },
  profile: { uz: "Profil", ru: "Профиль", en: "Profile" },
  search: { uz: "Mahsulot qidirish...", ru: "Поиск товаров...", en: "Search products..." },
  imageSearch: { uz: "Rasm orqali qidirish", ru: "Поиск по фото", en: "Search by image" },
  imageSearchCta: { uz: "Rasm yuklang — o'xshash mahsulotlarni topamiz", ru: "Загрузите фото — найдём похожие товары", en: "Upload a photo — we'll find similar products" },
  imageSearchHint: { uz: "Tanlangan rasm bo'yicha o'xshash mahsulotlar", ru: "Похожие товары по выбранному фото", en: "Similar products for selected image" },
  imageSearching: { uz: "Rasm tahlil qilinmoqda...", ru: "Анализируем изображение...", en: "Analyzing image..." },
  noSimilarProducts: { uz: "O'xshash mahsulot topilmadi", ru: "Похожие товары не найдены", en: "No similar products found" },
  findSimilarByImage: { uz: "Rasm bo'yicha o'xshashlarni topish", ru: "Найти похожие по фото", en: "Find similar by photo" },
  similarFound: { uz: "O'xshash mahsulotlar", ru: "Похожие товары", en: "Similar products" },

  flashSale: { uz: "Flash Sale", ru: "Flash Sale", en: "Flash Sale" },
  forYou: { uz: "Siz uchun tavsiyalar", ru: "Рекомендации для вас", en: "For you" },
  allProducts: { uz: "Barcha mahsulotlar", ru: "Все товары", en: "All products" },
  categories: { uz: "Kategoriyalar", ru: "Категории", en: "Categories" },
  addToCart: { uz: "Savatga qo'shish", ru: "В корзину", en: "Add to cart" },
  buyNow: { uz: "Hozir sotib olish", ru: "Купить сейчас", en: "Buy now" },
  inCart: { uz: "Savatda", ru: "В корзине", en: "In cart" },
  stock: { uz: "Omborda {n} dona qoldi", ru: "Осталось {n} шт", en: "{n} left in stock" },
  outOfStock: { uz: "Tugagan", ru: "Нет в наличии", en: "Out of stock" },
  reviews: { uz: "Sharhlar", ru: "Отзывы", en: "Reviews" },
  similar: { uz: "O'xshash mahsulotlar", ru: "Похожие товары", en: "Similar products" },
  description: { uz: "Tavsif", ru: "Описание", en: "Description" },
  seller: { uz: "Sotuvchi", ru: "Продавец", en: "Seller" },
  verified: { uz: "Tasdiqlangan xarid", ru: "Подтверждённая покупка", en: "Verified purchase" },
  emptyCart: { uz: "Savatingiz bo'sh", ru: "Корзина пуста", en: "Your cart is empty" },
  startShopping: { uz: "Xarid qilishni boshlash", ru: "Начать покупки", en: "Start shopping" },
  promoCode: { uz: "Promokod", ru: "Промокод", en: "Promo code" },
  apply: { uz: "Qo'llash", ru: "Применить", en: "Apply" },
  subtotal: { uz: "Mahsulotlar", ru: "Товары", en: "Subtotal" },
  delivery: { uz: "Yetkazib berish", ru: "Доставка", en: "Delivery" },
  discount: { uz: "Chegirma", ru: "Скидка", en: "Discount" },
  total: { uz: "Jami", ru: "Итого", en: "Total" },
  checkout: { uz: "Rasmiylashtirish", ru: "Оформить", en: "Checkout" },
  address: { uz: "Manzil", ru: "Адрес", en: "Address" },
  courierDelivery: { uz: "Kuryer orqali", ru: "Курьером", en: "Courier" },
  pickup: { uz: "O'zim olib ketaman", ru: "Самовывоз", en: "Pickup" },
  cash: { uz: "Naqd (yetkazganda)", ru: "Наличные при получении", en: "Cash on delivery" },
  comment: { uz: "Izoh (ixtiyoriy)", ru: "Комментарий", en: "Comment" },
  placeOrder: { uz: "Buyurtma berish", ru: "Заказать", en: "Place order" },
  orderSuccess: { uz: "Buyurtma qabul qilindi!", ru: "Заказ принят!", en: "Order placed!" },
  login: { uz: "Kirish", ru: "Войти", en: "Login" },
  loginTitle: { uz: "Telefon raqamingizni kiriting", ru: "Введите номер телефона", en: "Enter your phone number" },
  sendCode: { uz: "Kod yuborish", ru: "Отправить код", en: "Send code" },
  enterCode: { uz: "SMS kodni kiriting", ru: "Введите код из SMS", en: "Enter SMS code" },
  confirm: { uz: "Tasdiqlash", ru: "Подтвердить", en: "Confirm" },
  firstName: { uz: "Ism", ru: "Имя", en: "First name" },
  lastName: { uz: "Familiya", ru: "Фамилия", en: "Last name" },
  favorites: { uz: "Sevimlilar", ru: "Избранное", en: "Favorites" },
  myReviews: { uz: "Sharhlarim", ru: "Мои отзывы", en: "My reviews" },
  addresses: { uz: "Manzillarim", ru: "Мои адреса", en: "My addresses" },
  language: { uz: "Til", ru: "Язык", en: "Language" },
  referral: { uz: "Do'stingni taklif qil", ru: "Пригласи друга", en: "Invite a friend" },
  support: { uz: "Qo'llab-quvvatlash", ru: "Поддержка", en: "Support" },
  logout: { uz: "Chiqish", ru: "Выйти", en: "Logout" },
  deleteAccount: { uz: "Akkauntni o'chirish", ru: "Удалить аккаунт", en: "Delete account" },
  sellerPanel: { uz: "Sotuvchi paneli", ru: "Панель продавца", en: "Seller panel" },
  courierMode: { uz: "Kuryer rejimi", ru: "Режим курьера", en: "Courier mode" },
  adminPanel: { uz: "Admin panel", ru: "Админ панель", en: "Admin panel" },
  becomeSeller: { uz: "Sotuvchi bo'lish", ru: "Стать продавцом", en: "Become a seller" },
  notifications: { uz: "Bildirishnomalar", ru: "Уведомления", en: "Notifications" },
  guest: { uz: "Mehmon", ru: "Гость", en: "Guest" },
  loginToBuy: { uz: "Xarid qilish uchun tizimga kiring", ru: "Войдите чтобы купить", en: "Login to buy" },
  reorder: { uz: "Qayta buyurtma", ru: "Повторить заказ", en: "Reorder" },
  cancel: { uz: "Bekor qilish", ru: "Отменить", en: "Cancel" },
  all: { uz: "Hammasi", ru: "Все", en: "All" },
  active: { uz: "Aktiv", ru: "Активные", en: "Active" },
  done: { uz: "Yakunlangan", ru: "Завершённые", en: "Completed" },
  cancelled: { uz: "Bekor qilingan", ru: "Отменённые", en: "Cancelled" },
  st_new: { uz: "Yangi", ru: "Новый", en: "New" },
  st_confirmed: { uz: "Tasdiqlandi", ru: "Подтверждён", en: "Confirmed" },
  st_packing: { uz: "Yig'ilmoqda", ru: "Собирается", en: "Packing" },
  st_courier: { uz: "Kuryerda", ru: "У курьера", en: "With courier" },
  st_delivered: { uz: "Yetkazildi", ru: "Доставлен", en: "Delivered" },
  st_cancelled: { uz: "Bekor qilindi", ru: "Отменён", en: "Cancelled" },
  writeReview: { uz: "Sharh yozish", ru: "Написать отзыв", en: "Write review" },
  sort_mix: { uz: "Ommabop", ru: "Популярные", en: "Popular" },
  sort_cheap: { uz: "Arzon", ru: "Дешевле", en: "Cheap" },
  sort_expensive: { uz: "Qimmat", ru: "Дороже", en: "Expensive" },
  sort_new: { uz: "Yangi", ru: "Новинки", en: "New" },
  sort_rating: { uz: "Reyting", ru: "Рейтинг", en: "Rating" },
  share: { uz: "Ulashish", ru: "Поделиться", en: "Share" },
  becomeCourier: { uz: "Kuryer bo'lish", ru: "Стать курьером", en: "Become a courier" },
  addImages: { uz: "Rasmlar", ru: "Фотографии", en: "Images" },
  addImage: { uz: "Rasm qo'shish", ru: "Добавить фото", en: "Add image" },
  yourOrders: { uz: "Buyurtmalaringiz shu yerda ko'rinadi", ru: "Ваши заказы будут здесь", en: "Your orders will show here" },
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: string, vars?: Record<string, any>) => string; ready: boolean };
const LangContext = createContext<Ctx>({ lang: "uz", setLang: () => {}, t: (k) => k, ready: false });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("uz");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    storage.getItem("lang", "").then((v) => {
      const nextLang = v as Lang | "" | null;
      if (nextLang === "uz" || nextLang === "ru" || nextLang === "en") setLangState(nextLang);
      setReady(true);
    });
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    storage.setItem("lang", l);
  };
  const t = (k: string, vars?: Record<string, any>) => {
    let s = dict[k]?.[lang] ?? k;
    if (vars) Object.entries(vars).forEach(([key, v]) => (s = s.replace(`{${key}}`, String(v))));
    return s;
  };
  return <LangContext.Provider value={{ lang, setLang, t, ready }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
export const ml = (obj: any, lang: Lang) => obj?.[lang] || obj?.uz || "";
