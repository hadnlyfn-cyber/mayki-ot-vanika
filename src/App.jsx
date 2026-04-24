import { useEffect, useMemo, useRef, useState } from "react";
import { printZones, shirtCatalog } from "./lib/config";
import { translations } from "./lib/translations";

const initialSidePrint = {
  src: "",
  fileName: "",
  x: 50,
  y: 50,
  scale: 0.55,
  width: 0,
  height: 0
};

const screenOrder = ["home", "studio", "order"];

function formatOrderDate(language) {
  return new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

function dataUrlToBlob(dataUrl) {
  const [meta, content] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] ?? "image/png";
  const binary = atob(content);
  const array = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    array[index] = binary.charCodeAt(index);
  }

  return new Blob([array], { type: mime });
}

function buildOrderId() {
  const stamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MV-${stamp}-${random}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function readImageSize(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    image.onerror = reject;
    image.src = src;
  });
}

async function composeSideImage(baseSrc, print, side) {
  const zone = printZones[side];
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const baseImage = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = baseSrc;
  });

  canvas.width = baseImage.naturalWidth;
  canvas.height = baseImage.naturalHeight;
  context.drawImage(baseImage, 0, 0);

  if (print?.src) {
    const printImage = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = print.src;
    });

    const zoneX = (zone.x / 100) * canvas.width;
    const zoneY = (zone.y / 100) * canvas.height;
    const zoneWidth = (zone.width / 100) * canvas.width;
    const zoneHeight = (zone.height / 100) * canvas.height;

    const widthRatio = zoneWidth / print.width;
    const heightRatio = zoneHeight / print.height;
    const fitRatio = Math.min(widthRatio, heightRatio);
    const drawWidth = print.width * fitRatio * print.scale;
    const drawHeight = print.height * fitRatio * print.scale;
    const drawX = zoneX + (print.x / 100) * zoneWidth - drawWidth / 2;
    const drawY = zoneY + (print.y / 100) * zoneHeight - drawHeight / 2;

    context.save();
    context.beginPath();
    context.rect(zoneX, zoneY, zoneWidth, zoneHeight);
    context.clip();
    context.drawImage(printImage, drawX, drawY, drawWidth, drawHeight);
    context.restore();
  }

  return canvas.toDataURL("image/png");
}

function App() {
  const [language, setLanguage] = useState("ru");
  const [screen, setScreen] = useState("home");
  const [selectedColor, setSelectedColor] = useState("black");
  const [activeSide, setActiveSide] = useState("front");
  const [telegram, setTelegram] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [telegramConnection, setTelegramConnection] = useState("checking");
  const [orderData, setOrderData] = useState(null);
  const [prints, setPrints] = useState({
    front: { ...initialSidePrint },
    back: { ...initialSidePrint }
  });
  const [dragState, setDragState] = useState(null);
  const fileInputRef = useRef(null);
  const previewZoneRef = useRef(null);

  const t = translations[language];
  const shirt = shirtCatalog[selectedColor];
  const currentPrint = prints[activeSide];
  const viewImage = activeSide === "front" ? shirt.front : shirt.back;

  useEffect(() => {
    document.documentElement.lang = t.htmlLang;
    document.body.dataset.language = language;
  }, [language, t.htmlLang]);

  useEffect(() => {
    const controller = new AbortController();

    async function checkTelegramHealth() {
      try {
        const apiBaseUrl = (
          import.meta.env.VITE_API_URL || "http://localhost:8787"
        ).trim();
        const response = await fetch(`${apiBaseUrl}/api/health`, {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error("Health request failed");
        }

        const data = await response.json();
        setTelegramConnection(data.telegramReady ? "ready" : "missing");
      } catch (error) {
        if (error.name !== "AbortError") {
          setTelegramConnection("missing");
        }
      }
    }

    checkTelegramHealth();

    return () => controller.abort();
  }, []);

  const progress = useMemo(
    () => screenOrder.findIndex((item) => item === screen),
    [screen]
  );

  const sideStates = useMemo(
    () => ({
      front: Boolean(prints.front.src),
      back: Boolean(prints.back.src)
    }),
    [prints]
  );

  const handleToggleLanguage = () => {
    setLanguage((current) => (current === "ru" ? "en" : "ru"));
  };

  const handleStartDesign = () => {
    if (!selectedColor) {
      setStatus(t.missingSelection);
      return;
    }

    setStatus("");
    setScreen("studio");
  };

  const updateSidePrint = (side, nextValue) => {
    setPrints((current) => ({
      ...current,
      [side]: {
        ...current[side],
        ...nextValue
      }
    }));
  };

  const removeCurrentPrint = () => {
    updateSidePrint(activeSide, { ...initialSidePrint });
    setStatus("");
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const fileUrl = URL.createObjectURL(file);
      const size = await readImageSize(fileUrl);

      updateSidePrint(activeSide, {
        src: fileUrl,
        fileName: file.name,
        x: 50,
        y: 50,
        scale: 0.55,
        width: size.width,
        height: size.height
      });
      setStatus(t.sideSaved);
    } catch (error) {
      console.error(error);
      setStatus(t.uploadError);
    } finally {
      event.target.value = "";
    }
  };

  const validateSideBounds = (sidePrint) => {
    if (!sidePrint.src) {
      return true;
    }

    const baseFit = Math.min(1 / sidePrint.width, 1 / sidePrint.height);
    const widthPercent = sidePrint.width * baseFit * sidePrint.scale * 100;
    const heightPercent = sidePrint.height * baseFit * sidePrint.scale * 100;

    const left = sidePrint.x - widthPercent / 2;
    const right = sidePrint.x + widthPercent / 2;
    const top = sidePrint.y - heightPercent / 2;
    const bottom = sidePrint.y + heightPercent / 2;

    return left >= 0 && right <= 100 && top >= 0 && bottom <= 100;
  };

  const enforceBoundsOrReset = (side) => {
    const sidePrint = prints[side];

    if (!sidePrint.src) {
      return;
    }

    if (!validateSideBounds(sidePrint)) {
      updateSidePrint(side, { ...initialSidePrint });
      setStatus(t.removedOutOfBounds);
    }
  };

  const handleScaleChange = (event) => {
    const nextScale = Number(event.target.value);
    updateSidePrint(activeSide, { scale: nextScale });
  };

  useEffect(() => {
    enforceBoundsOrReset(activeSide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrint.scale]);

  const handlePointerDown = (event) => {
    if (!currentPrint.src || !previewZoneRef.current) {
      return;
    }

    event.preventDefault();
    const zoneRect = previewZoneRef.current.getBoundingClientRect();
    setDragState({
      startX: event.clientX,
      startY: event.clientY,
      originX: currentPrint.x,
      originY: currentPrint.y,
      zoneWidth: zoneRect.width,
      zoneHeight: zoneRect.height
    });
  };

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      const deltaX = ((event.clientX - dragState.startX) / dragState.zoneWidth) * 100;
      const deltaY = ((event.clientY - dragState.startY) / dragState.zoneHeight) * 100;

      updateSidePrint(activeSide, {
        x: clamp(dragState.originX + deltaX, -20, 120),
        y: clamp(dragState.originY + deltaY, -20, 120)
      });
    };

    const handlePointerUp = () => {
      setDragState(null);
      enforceBoundsOrReset(activeSide);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeSide, dragState, prints, t.removedOutOfBounds]);

  const buildOrderPayload = async (orderId, dateLabel) => {
    const frontComposite = await composeSideImage(shirt.front, prints.front, "front");
    const backComposite = await composeSideImage(shirt.back, prints.back, "back");

    return {
      orderId,
      language,
      colorKey: selectedColor,
      colorLabel: shirt.label[language],
      telegram,
      dateLabel,
      frontComposite,
      backComposite,
      frontPrint: prints.front.src
        ? {
            name: prints.front.fileName,
            dataUrl: prints.front.src
          }
        : null,
      backPrint: prints.back.src
        ? {
            name: prints.back.fileName,
            dataUrl: prints.back.src
          }
        : null
    };
  };

  const handleConfirmOrder = async () => {
    const hasAnyPrint = prints.front.src || prints.back.src;

    if (!hasAnyPrint) {
      setStatus(t.missingPrint);
      return;
    }

    if (!/^@[A-Za-z0-9_]{4,32}$/.test(telegram.trim())) {
      setStatus(t.missingTelegram);
      return;
    }

    setSending(true);
    setStatus("");

    try {
      const orderId = buildOrderId();
      const dateLabel = formatOrderDate(language);
      const payload = await buildOrderPayload(orderId, dateLabel);

      setOrderData(payload);
      setScreen("order");

      const response = await fetch(
        `${(import.meta.env.VITE_API_URL || "http://localhost:8787").trim()}/api/orders`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        throw new Error("Telegram request failed");
      }

      setStatus(t.statusSent);
    } catch (error) {
      console.error(error);
      setStatus(t.statusDraft);
    } finally {
      setSending(false);
    }
  };

  const resetFlow = () => {
    setScreen("home");
    setActiveSide("front");
    setTelegram("");
    setOrderData(null);
    setStatus("");
    setPrints({
      front: { ...initialSidePrint },
      back: { ...initialSidePrint }
    });
  };

  const currentZone = printZones[activeSide];
  const baseFit = currentPrint.width && currentPrint.height
    ? Math.min(1 / currentPrint.width, 1 / currentPrint.height)
    : 0;
  const previewWidth = currentPrint.width * baseFit * currentPrint.scale * 100;
  const previewHeight = currentPrint.height * baseFit * currentPrint.scale * 100;

  const orderDownloads = orderData
    ? [
        orderData.frontPrint
          ? {
              label: t.downloadFrontPrint,
              href: orderData.frontPrint.dataUrl,
              name: orderData.frontPrint.name
            }
          : null,
        orderData.backPrint
          ? {
              label: t.downloadBackPrint,
              href: orderData.backPrint.dataUrl,
              name: orderData.backPrint.name
            }
          : null
      ].filter(Boolean)
    : [];

  const telegramHint =
    telegramConnection === "ready"
      ? t.telegramReady
      : telegramConnection === "checking"
        ? t.telegramChecking
        : t.telegramMissing;

  return (
    <div className={`app app--${language}`}>
      <div className="background-glow background-glow--left" />
      <div className="background-glow background-glow--right" />

      <header className="topbar">
        <button className="lang-switch" type="button" onClick={handleToggleLanguage}>
          {t.translate}
        </button>
        <div className="brand-frame">{t.title}</div>
      </header>

      <main className="screen-stack">
        <aside className="progress-rail" aria-label="Progress">
          {screenOrder.map((step, index) => (
            <div
              key={step}
              className={`progress-dot ${progress >= index ? "is-active" : ""}`}
            />
          ))}
        </aside>

        <section className={`screen-card ${screen === "home" ? "is-visible" : ""}`}>
          <div className="copy-block">
            <span className="eyebrow">{t.heroKicker}</span>
            <h1>{t.heroTitle}</h1>
            <p>{t.heroText}</p>
          </div>

          <div className="home-layout">
            <div className="selection-panel">
              <span className="panel-label">{t.pickColor}</span>
              <h2>{t.chooseColor}</h2>
              <p>{t.colorHint}</p>

              <div className="color-grid">
                {Object.values(shirtCatalog).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`color-card ${
                      selectedColor === item.key ? "is-selected" : ""
                    }`}
                    onClick={() => setSelectedColor(item.key)}
                  >
                    <span
                      className="color-chip"
                      style={{ background: item.accent }}
                    />
                    <span>{item.label[language]}</span>
                  </button>
                ))}
              </div>

              <button className="primary-button" type="button" onClick={handleStartDesign}>
                {t.startDesign}
              </button>
            </div>

            <div className="hero-preview">
              <div className="preview-card">
                <span className="preview-tag">{t.selectedColor}</span>
                <img src={shirt.front} alt={shirt.label[language]} />
              </div>
            </div>
          </div>
        </section>

        <section className={`screen-card ${screen === "studio" ? "is-visible" : ""}`}>
          <div className="copy-block">
            <span className="eyebrow">{t.studioBadge}</span>
            <h1>{t.studioTitle}</h1>
            <p>{t.studioText}</p>
          </div>

          <div className="studio-layout">
            <div className="mockup-stage">
              <div className="side-toggle">
                <button
                  type="button"
                  className={activeSide === "front" ? "is-active" : ""}
                  onClick={() => setActiveSide("front")}
                >
                  {t.sideFront}
                </button>
                <button
                  type="button"
                  className={activeSide === "back" ? "is-active" : ""}
                  onClick={() => setActiveSide("back")}
                >
                  {t.sideBack}
                </button>
              </div>

              <div className="mockup-shell">
                <img src={viewImage} alt={`${shirt.label[language]} ${activeSide}`} />

                <div
                  ref={previewZoneRef}
                  className="print-zone"
                  style={{
                    left: `${currentZone.x}%`,
                    top: `${currentZone.y}%`,
                    width: `${currentZone.width}%`,
                    height: `${currentZone.height}%`
                  }}
                >
                  {currentPrint.src ? (
                    <img
                      src={currentPrint.src}
                      alt="User print"
                      className="draggable-print"
                      onPointerDown={handlePointerDown}
                      style={{
                        width: `${previewWidth}%`,
                        height: `${previewHeight}%`,
                        left: `${currentPrint.x}%`,
                        top: `${currentPrint.y}%`
                      }}
                    />
                  ) : (
                    <div className="print-placeholder">
                      {activeSide === "front" ? t.placeholderFront : t.placeholderBack}
                    </div>
                  )}
                </div>
              </div>

              <p className="hint-text">{t.printHint}</p>
            </div>

            <div className="control-panel">
              <div className="control-box">
                <span className="panel-label">{t.chooseFrontBack}</span>
                <div className="status-pills">
                  <span className={sideStates.front ? "is-ready" : ""}>
                    {t.frontReady}
                  </span>
                  <span className={sideStates.back ? "is-ready" : ""}>
                    {t.backReady}
                  </span>
                </div>
              </div>

              <div className="control-box">
                <button className="primary-button" type="button" onClick={handleUploadClick}>
                  {currentPrint.src ? t.replacePrint : t.uploadPrint}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  hidden
                  onChange={handleFileChange}
                />

                <button className="ghost-button" type="button" onClick={() => setActiveSide((side) => (side === "front" ? "back" : "front"))}>
                  {t.switchSide}
                </button>

                {currentPrint.src ? (
                  <button className="ghost-button" type="button" onClick={removeCurrentPrint}>
                    {t.removePrint}
                  </button>
                ) : null}
              </div>

              <div className="control-box">
                <label className="range-label" htmlFor="scale-range">
                  {t.printScale}
                </label>
                <input
                  id="scale-range"
                  type="range"
                  min="0.2"
                  max="1"
                  step="0.01"
                  value={currentPrint.scale}
                  onChange={handleScaleChange}
                  disabled={!currentPrint.src}
                />
                <span className="range-value">
                  {Math.round(currentPrint.scale * 100)}%
                </span>
              </div>

              <div className="control-box">
                <button className="primary-button" type="button" onClick={() => setScreen("order")}>
                  {t.saveDesign}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={`screen-card ${screen === "order" ? "is-visible" : ""}`}>
          <div className="copy-block">
            <span className="eyebrow">
              {orderData ? t.orderBadge : t.confirmBadge}
            </span>
            <h1>{orderData ? t.orderTitle : t.confirmTitle}</h1>
            <p>{orderData ? t.orderText : t.confirmText}</p>
          </div>

          {orderData ? (
            <div className="order-layout">
              <div className="order-meta">
                <div>
                  <span>{t.orderNumber}</span>
                  <strong>{orderData.orderId}</strong>
                </div>
                <div>
                  <span>{t.orderDate}</span>
                  <strong>{orderData.dateLabel}</strong>
                </div>
                <div>
                  <span>{t.color}</span>
                  <strong>{orderData.colorLabel}</strong>
                </div>
                <div>
                  <span>{t.contact}</span>
                  <strong>{orderData.telegram}</strong>
                </div>
              </div>

              <div className="order-gallery">
                <figure className="order-shot">
                  <img src={orderData.frontComposite} alt={t.frontLabel} />
                  <figcaption>{t.frontLabel}</figcaption>
                </figure>
                <figure className="order-shot">
                  <img src={orderData.backComposite} alt={t.backLabel} />
                  <figcaption>{t.backLabel}</figcaption>
                </figure>
              </div>

              <div className="download-row">
                {orderDownloads.map((item) => (
                  <a
                    key={item.label}
                    className="ghost-button download-link"
                    href={item.href}
                    download={item.name}
                  >
                    {item.label}
                  </a>
                ))}
              </div>

              <button className="primary-button" type="button" onClick={resetFlow}>
                {t.createAnother}
              </button>
            </div>
          ) : (
            <div className="confirm-layout">
              <label className="input-block" htmlFor="telegram">
                <span>{t.telegramLabel}</span>
                <input
                  id="telegram"
                  type="text"
                  value={telegram}
                  onChange={(event) => setTelegram(event.target.value)}
                  placeholder={t.telegramPlaceholder}
                />
              </label>

              <button
                className="primary-button"
                type="button"
                onClick={handleConfirmOrder}
                disabled={sending}
              >
                {sending ? t.sending : t.confirmOrder}
              </button>

              <p className="hint-text">{telegramHint}</p>
            </div>
          )}
        </section>
      </main>

      {status ? <div className="status-toast">{status}</div> : null}
    </div>
  );
}

export default App;
