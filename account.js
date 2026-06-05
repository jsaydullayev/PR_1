/* ============================================================
   Parizoda — login + 2 sahifa + sinxron javob/rasm
   Saqlash: Firebase Firestore (config to'ldirilgan bo'lsa) yoki
   localStorage (zaxira). Firebase'da javob va rasm ikkala
   qurilmada real-vaqtda sinxron ko'rinadi.
   ============================================================ */
(function () {
    const LS_SESSION = "pj_session";

    const USERS = {
        parizoda: { pw: "parizodam", view: "parizoda" },
        jaxongir: { pw: "parizodam", view: "jaxongir" },
    };

    /* ---------- STORE: Firebase yoki localStorage ---------- */
    const Store = (function () {
        const BLANK = {
            lovePercent: null,
            madeUp: false,
            madeUpAt: null,
            photo: null,
            shart: null,
            shartAt: null,
            updatedAt: null,
        };
        let data = Object.assign({}, BLANK);
        let cb = null;
        let mode = "local";
        let fbRef = null;
        const LS = "pj_answers";

        function readLS() {
            try {
                return JSON.parse(localStorage.getItem(LS) || "null") || {};
            } catch (e) {
                return {};
            }
        }
        function writeLS() {
            try {
                localStorage.setItem(LS, JSON.stringify(data));
            } catch (e) {}
        }
        function emit() {
            if (cb) cb(data);
        }

        function init(onChange) {
            cb = onChange;
            const cfg = window.FIREBASE_CONFIG || {};
            const ready =
                cfg.apiKey &&
                cfg.apiKey.length > 10 &&
                window.firebase &&
                firebase.firestore;
            if (ready) {
                try {
                    if (!firebase.apps.length) firebase.initializeApp(cfg);
                    const d = window.COUPLE_DOC || {
                        collection: "couple",
                        id: "us",
                    };
                    fbRef = firebase
                        .firestore()
                        .collection(d.collection)
                        .doc(d.id);
                    mode = "firebase";
                    fbRef.onSnapshot(
                        function (snap) {
                            const v = snap.exists ? snap.data() : {};
                            data = Object.assign({}, BLANK, v);
                            emit();
                        },
                        function (err) {
                            console.warn(
                                "Firestore o\u02bbqishda xato:",
                                err && err.code,
                            );
                        },
                    );
                    console.log(
                        "%cParizoda: Firebase rejimi yoqildi 💗",
                        "color:#D6537E",
                    );
                } catch (e) {
                    console.warn("Firebase init xato, localStorage rejimi:", e);
                    mode = "local";
                }
            }
            if (mode === "local") {
                data = Object.assign({}, BLANK, readLS());
                window.addEventListener("storage", function (e) {
                    if (e.key === LS) {
                        data = Object.assign({}, BLANK, readLS());
                        emit();
                    }
                });
                setTimeout(emit, 0);
            }
        }

        function patch(p) {
            const stamp = Date.now();
            data = Object.assign({}, data, p, { updatedAt: stamp });
            if (mode === "firebase" && fbRef) {
                fbRef
                    .set(Object.assign({}, p, { updatedAt: stamp }), {
                        merge: true,
                    })
                    .catch(function (e) {
                        console.warn("Saqlashda xato:", e && e.code);
                    });
                // onSnapshot keyin yangilangan data bilan emit qiladi
            } else {
                writeLS();
                emit();
            }
        }

        return {
            init: init,
            get: function () {
                return data;
            },
            setAnswer: function (a) {
                patch(a);
            },
            setPhoto: function (url) {
                patch({ photo: url });
            },
            setShart: function (text) {
                patch({ shart: text, shartAt: Date.now() });
            },
            get mode() {
                return mode;
            },
        };
    })();

    /* ---------- toast ---------- */
    let toastEl = null;
    function toast(msg) {
        if (!toastEl) {
            toastEl = document.createElement("div");
            toastEl.className = "toast";
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        toastEl.classList.add("show");
        clearTimeout(toastEl._t);
        toastEl._t = setTimeout(function () {
            toastEl.classList.remove("show");
        }, 2600);
    }

    /* ---------- view switching ---------- */
    function applyView(view) {
        document.body.classList.remove("locked", "as-parizoda", "as-jaxongir");
        document.body.classList.add("as-" + view);
        onData();
        if (view === "parizoda") preloadSlider();
        if (view === "jaxongir") startDashPoll();
    }
    function logout() {
        localStorage.removeItem(LS_SESSION);
        document.body.classList.remove("as-parizoda", "as-jaxongir");
        document.body.classList.add("locked");
        const f = document.getElementById("loginForm");
        if (f) f.reset();
        window.scrollTo(0, 0);
    }

    /* ---------- login ---------- */
    function setupLogin() {
        const form = document.getElementById("loginForm");
        const err = document.getElementById("loginErr");
        if (!form) return;
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            const u = (document.getElementById("loginUser").value || "")
                .trim()
                .toLowerCase();
            const p = (document.getElementById("loginPass").value || "").trim();
            const rec = USERS[u];
            if (rec && rec.pw === p) {
                err.classList.remove("show");
                localStorage.setItem(LS_SESSION, u);
                applyView(rec.view);
            } else {
                err.classList.add("show");
                form.classList.remove("shake");
                void form.offsetWidth;
                form.classList.add("shake");
            }
        });
        document.querySelectorAll("[data-logout]").forEach(function (b) {
            b.addEventListener("click", logout);
        });
    }

    /* ---------- Parizoda: javobni yozish ---------- */
    let sliderTouched = false;
    function preloadSlider() {
        const range = document.getElementById("loveRange");
        const d = Store.get();
        if (range && !sliderTouched && d.lovePercent != null) {
            range.value = d.lovePercent;
            range.dispatchEvent(new Event("input"));
        }
    }
    function setupParizoda() {
        const range = document.getElementById("loveRange");
        if (range) {
            range.addEventListener("input", function () {
                sliderTouched = true;
            });
            range.addEventListener("change", function () {
                Store.setAnswer({ lovePercent: +range.value });
                toast(
                    "\ud83d\udc8c \u0416\u0430\u04b3\u043e\u043d\u0433\u0438\u0440\u0433\u0430 \u044e\u0431\u043e\u0440\u0438\u043b\u0434\u0438",
                );
            });
        }
        const yes = document.getElementById("btnYes");
        if (yes) {
            yes.addEventListener("click", function () {
                const r = document.getElementById("loveRange");
                const cur = Store.get().lovePercent;
                Store.setAnswer({
                    madeUp: true,
                    madeUpAt: Date.now(),
                    lovePercent: cur == null && r ? +r.value : cur,
                });
                toast(
                    "\ud83e\udd0d \u0416\u0430\u04b3\u043e\u043d\u0433\u0438\u0440\u0433\u0430 \u0435\u0442\u043a\u0430\u0437\u0438\u043b\u0434\u0438",
                );
            });
        }
    }

    /* ---------- shared rasm (Firebase-sinxron) ---------- */
    async function compressImage(file) {
        const max = 1100,
            q = 0.82;
        const bmp = await createImageBitmap(file);
        const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
        const w = Math.max(1, Math.round(bmp.width * scale));
        const h = Math.max(1, Math.round(bmp.height * scale));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(bmp, 0, 0, w, h);
        return c.toDataURL("image/jpeg", q);
    }
    function openLightbox(src) {
        const lb = document.getElementById("lightbox"),
            im = document.getElementById("lbImg");
        if (!lb) return;
        im.src = src;
        lb.classList.add("show");
    }
    function renderPhoto() {
        const img = document.getElementById("usPhotoImg");
        const empty = document.getElementById("usPhotoEmpty");
        const change = document.getElementById("usPhotoChange");
        if (!img) return;
        const url = Store.get().photo;
        if (url) {
            img.src = url;
            img.hidden = false;
            empty.hidden = true;
            if (change) change.hidden = false;
        } else {
            img.hidden = true;
            empty.hidden = false;
            if (change) change.hidden = true;
        }
    }
    function setupPhoto() {
        const slot = document.getElementById("usPhoto");
        const input = document.getElementById("usPhotoInput");
        const change = document.getElementById("usPhotoChange");
        if (!slot || !input) return;
        const pick = function () {
            input.click();
        };
        slot.addEventListener("click", function () {
            if (Store.get().photo) openLightbox(Store.get().photo);
            else pick();
        });
        slot.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                slot.click();
            }
        });
        if (change)
            change.addEventListener("click", function (e) {
                e.stopPropagation();
                pick();
            });
        input.addEventListener("change", async function () {
            const f = input.files && input.files[0];
            if (!f) return;
            try {
                toast(
                    "\u23f3 \u0420\u0430\u0441\u043c \u044e\u043a\u043b\u0430\u043d\u043c\u043e\u049b\u0434\u0430...",
                );
                const url = await compressImage(f);
                Store.setPhoto(url);
                toast(
                    "\ud83d\udc97 \u0420\u0430\u0441\u043c \u0441\u0430\u049b\u043b\u0430\u043d\u0434\u0438",
                );
            } catch (e) {
                toast(
                    "\u0420\u0430\u0441\u043c\u043d\u0438 \u045e\u049b\u0438\u0431 \u0431\u045e\u043b\u043c\u0430\u0434\u0438 \ud83e\udd7a",
                );
            }
            input.value = "";
        });
    }

    /* ---------- Jaxongir: dashboard ---------- */
    let dashTimer = null;
    function fmtTime(v) {
        if (!v) return "";
        const d = new Date(v);
        const m = [
            "янв",
            "фев",
            "мар",
            "апр",
            "май",
            "июн",
            "июл",
            "авг",
            "сен",
            "окт",
            "ноя",
            "дек",
        ];
        return (
            d.getDate() +
            "-" +
            m[d.getMonth()] +
            ", " +
            String(d.getHours()).padStart(2, "0") +
            ":" +
            String(d.getMinutes()).padStart(2, "0")
        );
    }
    function renderDashboard() {
        const d = Store.get();
        const big = document.getElementById("dashPct");
        if (!big) return;
        const fill = document.getElementById("dashFill");
        const sub = document.getElementById("dashSub");
        const made = document.getElementById("dashMade");
        const shartEl = document.getElementById("dashShart");
        const upd = document.getElementById("dashUpd");
        const has = d.lovePercent != null;
        const pct = has ? d.lovePercent : 0;
        const isInf = pct >= 100;

        if (!has) {
            big.textContent = "\u2014";
            fill.style.width = "0%";
            sub.textContent =
                "\u041f\u0430\u0440\u0438\u0437\u043e\u0434\u0430 \u04b3\u0430\u043b\u0438 \u0436\u0430\u0432\u043e\u0431 \u0431\u0435\u0440\u043c\u0430\u0433\u0430\u043d. \u0423 \u045e\u0437 \u0441\u0430\u04b3\u0438\u0444\u0430\u0441\u0438\u0434\u0430 \u0441\u0435\u0432\u0433\u0438 \u045e\u043b\u0447\u0430\u0433\u0438\u0447\u043d\u0438 \u0441\u0443\u0440\u0433\u0430\u043d\u0434\u0430, \u0436\u0430\u0432\u043e\u0431\u0438 \u0448\u0443 \u0435\u0440\u0434\u0430 \u043f\u0430\u0439\u0434\u043e \u0431\u045e\u043b\u0430\u0434\u0438.";
        } else {
            big.textContent = isInf ? "\u221e" : pct + "%";
            fill.style.width = (isInf ? 100 : pct) + "%";
            let line;
            if (isInf)
                line =
                    "\u0427\u0435\u043a\u0441\u0438\u0437. \u0421\u0435\u0432\u0433\u0438\u0441\u0438\u043d\u0438\u043d\u0433 \u0447\u0435\u0433\u0430\u0440\u0430\u0441\u0438 \u0439\u045e\u049b.";
            else if (pct >= 85)
                line =
                    "\u0421\u0435\u043d\u0438 \u0447\u0438\u043d\u0434\u0430\u043d \u049b\u0430\u0442\u0442\u0438\u049b \u0441\u0435\u0432\u0430\u0434\u0438.";
            else if (pct >= 55)
                line =
                    "\u042e\u0440\u0430\u0433\u0438 \u0441\u0435\u043d\u0438\u043a\u0438 \u2014 \u0431\u0443 \u0430\u043d\u0438\u049b.";
            else if (pct >= 25)
                line =
                    "\u0421\u0435\u0432\u0430\u0434\u0438, \u043b\u0435\u043a\u0438\u043d \u04b3\u043e\u0437\u0438\u0440 \u0431\u0438\u0440\u043e\u0437 \u0430\u0440\u0430\u0437\u0434\u0430\u0434\u0430\u043a.";
            else
                line =
                    "\u04b2\u043e\u0437\u0438\u0440 \u043a\u045e\u043d\u0433\u043b\u0438 \u0442\u045e\u043b\u0438\u0431 \u0442\u0443\u0440\u0433\u0430\u043d\u0434\u0430\u043a. \u0411\u043e\u0440\u0438\u0431 \u0433\u0430\u043f\u043b\u0430\u0448\u0438\u0431 \u043a\u045e\u0440.";
            sub.textContent = line;
        }
        if (d.madeUp) {
            made.className = "dash-status ok";
            made.innerHTML =
                '<span class="ds-ico">\ud83e\udd0d</span> \u041f\u0430\u0440\u0438\u0437\u043e\u0434\u0430 \u044f\u0440\u0430\u0448\u0434\u0438!' +
                (d.madeUpAt
                    ? ' <span class="ds-time">' +
                      fmtTime(d.madeUpAt) +
                      "</span>"
                    : "");
        } else {
            made.className = "dash-status wait";
            made.innerHTML =
                '<span class="ds-ico">\u231b</span> \u00ab\u041a\u0435\u043b, \u044f\u0440\u0430\u0448\u0430\u0439\u043b\u0438\u043a\u043c\u0438?\u00bb \u2014 \u04b3\u0430\u043b\u0438 \u0436\u0430\u0432\u043e\u0431 \u043a\u0443\u0442\u0438\u043b\u043c\u043e\u049b\u0434\u0430';
        }
        if (shartEl) {
            if (d.shart) {
                shartEl.hidden = false;
                shartEl.innerHTML =
                    '<div class="dsh-label">★ Дон-дон зики — Паризода бажарадиган шарт ★</div>' +
                    '<div class="dsh-text">«' +
                    d.shart +
                    "»</div>" +
                    (d.shartAt
                        ? '<div class="dsh-time">қабул қилди: ' +
                          fmtTime(d.shartAt) +
                          "</div>"
                        : "");
            } else {
                shartEl.hidden = true;
            }
        }
        var dPhotoWrap = document.getElementById("dashPhotoWrap");
        var dPhotoImg = document.getElementById("dashPhotoImg");
        if (dPhotoWrap && dPhotoImg) {
            if (d.photo) {
                dPhotoImg.src = d.photo;
                dPhotoWrap.hidden = false;
            } else {
                dPhotoImg.removeAttribute("src");
                dPhotoWrap.hidden = true;
            }
        }
        upd.textContent = d.updatedAt
            ? "\u043e\u0445\u0438\u0440\u0433\u0438 \u044f\u043d\u0433\u0438\u043b\u0430\u043d\u0438\u0448: " +
              fmtTime(d.updatedAt)
            : "";
    }
    function startDashPoll() {
        // Firebase rejimida onSnapshot real-vaqtda yangilaydi; localStorage
        // rejimida boshqa qurilmadan o'qish uchun davriy yangilab turamiz.
        clearTimeout(dashTimer);
        if (Store.mode === "firebase") return;
        const poll = function () {
            if (!document.body.classList.contains("as-jaxongir")) return;
            try {
                const j = JSON.parse(
                    localStorage.getItem("pj_answers") || "null",
                );
                if (j) renderDashboard();
            } catch (e) {}
            dashTimer = setTimeout(poll, 3000);
        };
        dashTimer = setTimeout(poll, 3000);
    }

    /* ---------- har bir data o'zgarganda ---------- */
    function onData() {
        renderPhoto();
        if (document.body.classList.contains("as-jaxongir")) renderDashboard();
        if (document.body.classList.contains("as-parizoda")) preloadSlider();
    }

    /* ---------- boot ---------- */
    function boot() {
        setupLogin();
        setupParizoda();
        setupPhoto();
        const refresh = document.getElementById("dashRefresh");
        if (refresh)
            refresh.addEventListener("click", function () {
                renderDashboard();
                toast(
                    "\ud83d\udd04 \u042f\u043d\u0433\u0438\u043b\u0430\u043d\u0434\u0438",
                );
            });
        Store.init(onData);
        window.PJ = {
            setShart: function (t) {
                Store.setShart(t);
            },
        };
        const sess = localStorage.getItem(LS_SESSION);
        if (sess && USERS[sess]) applyView(USERS[sess].view);
        else document.body.classList.add("locked");
    }
    if (document.readyState === "loading")
        document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
