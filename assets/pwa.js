(() => {
  "use strict";

  if (!("serviceWorker" in navigator)) return;

  let isRefreshing = false;

  function showUpdateBanner(onUpdateClick) {
    if (document.getElementById("pwaUpdateBanner")) return;

    const banner = document.createElement("section");
    banner.id = "pwaUpdateBanner";
    banner.className = "pwaUpdateBanner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");

    const text = document.createElement("p");
    text.className = "pwaUpdateText";
    text.textContent = "新しいバージョンがあります。更新して反映しますか？";

    const actions = document.createElement("div");
    actions.className = "pwaUpdateActions";

    const updateBtn = document.createElement("button");
    updateBtn.type = "button";
    updateBtn.className = "btn btnPrimary";
    updateBtn.textContent = "今すぐ更新";
    updateBtn.addEventListener("click", onUpdateClick);

    const laterBtn = document.createElement("button");
    laterBtn.type = "button";
    laterBtn.className = "btn btnGhost";
    laterBtn.textContent = "あとで";
    laterBtn.addEventListener("click", () => {
      banner.remove();
    });

    actions.append(updateBtn, laterBtn);
    banner.append(text, actions);
    document.body.appendChild(banner);
  }

  function setupWaitingWorker(registration) {
    if (!registration.waiting) return;

    showUpdateBanner(() => {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    });
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then((registration) => {
        // 起動時点で待機中の更新があれば通知する
        setupWaitingWorker(registration);

        // 新しい SW を見つけたら、インストール完了後に通知する
        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
              setupWaitingWorker(registration);
            }
          });
        });

        // 復帰時などにも更新確認
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            void registration.update();
          }
        });
      })
      .catch(() => {
        // 登録に失敗してもアプリ本体は動くようにする
      });
  });

  // 新しい SW が有効化されたら、1回だけ安全に再読み込みする
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (isRefreshing) return;
    isRefreshing = true;
    window.location.reload();
  });
})();

