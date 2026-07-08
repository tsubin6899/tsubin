# Firebase 同步設定

這個分帳 APP 已經支援 Firebase Firestore 即時同步。預設仍是本機模式；填好 `firebase-config.js` 後，大家用同一個「旅行代碼」就會看到同一份帳。

## 1. 建立 Firebase 專案

1. 到 Firebase Console 建立專案。
2. 建立 Web App。
3. 複製 Firebase config。
4. 啟用 Firestore Database。

## 2. 填入設定

打開 `firebase-config.js`，改成：

```js
window.TRIP_EXPENSE_FIREBASE = {
  enabled: true,
  tripCode: "SOUTH-ITALY-2026",
  config: {
    apiKey: "你的 apiKey",
    authDomain: "你的 authDomain",
    projectId: "你的 projectId",
    storageBucket: "你的 storageBucket",
    messagingSenderId: "你的 messagingSenderId",
    appId: "你的 appId"
  }
};
```

## 3. 建議 Firestore Rules

簡單旅行代碼版沒有登入，所以規則只能做到「允許知道網址的人使用」。旅行結束後可把寫入關掉。

測試期間可先用：

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tripExpenseBooks/{tripCode}/{document=**} {
      allow read, write: if tripCode.matches('^[A-Za-z0-9-]{4,40}$');
    }
  }
}
```

比較保守的作法是旅行結束後改成只讀，或刪掉這組規則。

## 4. 資料位置

Firestore 會使用：

```txt
tripExpenseBooks/{旅行代碼}/settings/main
tripExpenseBooks/{旅行代碼}/expenses/{自動ID}
tripExpenseBooks/{旅行代碼}/settlementPeriods/{自動ID}
```
