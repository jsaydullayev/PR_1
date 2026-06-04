/* ============================================================
   FIREBASE CONFIG  —  faqat shu faylni to'ldiring!
   ------------------------------------------------------------
   1. https://console.firebase.google.com  -> "Add project"
   2. Project ichida: Build -> Firestore Database -> Create database
      (Production yoki Test mode — keyin qoidalarni DEPLOY.md dan qo'ying)
   3. Project Settings (⚙️) -> "Your apps" -> Web (</>) ilovasi qo'shing
   4. Ko'rsatilgan firebaseConfig qiymatlarini pastga ko'chiring.

   Agar bu yer bo'sh qolsa (apiKey = "") — sayt localStorage rejimida
   ishlaydi (faqat shu qurilmada saqlanadi, sinxron emas). Domenda
   ikkala telefonda ko'rinishi uchun pastni TO'LDIRING.
   ============================================================ */
window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

/* Juftlik uchun bitta hujjat manzili — o'zgartirish shart emas */
window.COUPLE_DOC = { collection: "couple", id: "jaxongir-parizoda" };
