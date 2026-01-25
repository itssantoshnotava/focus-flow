import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBWev2yh8XuvTp-Tfw3lCPzaulHKVtdig4",
    authDomain: "please-focus-gng.firebaseapp.com",
      databaseURL: "https://please-focus-gng-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "please-focus-gng",
          storageBucket: "please-focus-gng.firebasestorage.app",
            messagingSenderId: "649533529275",
              appId: "1:649533529275:web:be4129252ac9fa7a655d9e"
              };

              const app = initializeApp(firebaseConfig);
              export const database = getDatabase(app);