let LIB = null;
let selectedBg = null;
let selectedChar = null;
const pages = []; // { canvas, panels: [fabric.Rect], bgImagesPerPanel: [fabric.Image|null] }

async function loadLibrary() {
  const res = await fetch("/library.json");
  LIB = await res.json();
  // Templates
  const sel = document.getElementById("templateSelect");
  LIB.templates.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    sel.appendChild(opt);
  });
  sel.value = LIB.templates[0].id;

  // Filters
  fillFilters("bgCategoryFilter", LIB.backgrounds.map(b => b.category));
  fillFilters("charCategoryFilter", LIB.characters.map(c => c.category));

  // Thumbs
  renderThumbs();
  // Start with one page
  addPage();
}
async function generatePanel(prompt) {
  const res = await fetch("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: prompt,
      negative_prompt: "blurry, low quality, distorted hands, messy background, grainy"
    })
  });
  const data = await res.json();
  if (data.ok) {
    return data.image; // base64 image
  } else {
    alert("Generation failed: " + data.error);
    return null;
  }
}

async function exportComic() {
  const pages = [];
  document.querySelectorAll("canvas").forEach((canvasEl) => {
    // fabric.js canvas → PNG base64
    const dataUrl = canvasEl.toDataURL("image/png");
    pages.push(dataUrl);
  });

  // Send pages to backend
  const res = await fetch("/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pages })
  });

  const result = await res.json();
  if (result.ok) {
    window.open(result.url, "_blank");
  } else {
    alert("Export failed: " + result.error);
  }
}
document.getElementById("exportBtn").addEventListener("click", exportComic);

async function generateComic() {
  const res = await fetch("/static/data/story.json");
  const story = await res.json();
  
  const pagesDiv = document.getElementById("pages");
  pagesDiv.innerHTML = ""; // clear old

  for (const prompt of story.panels) {
    const imgUrl = await generatePanel(prompt);
    if (!imgUrl) continue;

    const canvasEl = document.createElement("canvas");
    canvasEl.width = 768;
    canvasEl.height = 768;
    pagesDiv.appendChild(canvasEl);

    const canvas = new fabric.Canvas(canvasEl);
    fabric.Image.fromURL(imgUrl, (img) => {
      img.scaleToWidth(768);
      img.scaleToHeight(768);
      canvas.add(img);
      canvas.sendToBack(img);
    });
  }
}


function fillFilters(selectId, items) {
  const sel = document.getElementById(selectId);
  Array.from(new Set(items)).forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat; opt.textContent = cat;
    sel.appendChild(opt);
  });
}

function renderThumbs() {
  const bgList = document.getElementById("bgList");
  const charList = document.getElementById("charList");
  bgList.innerHTML = ""; charList.innerHTML = "";

  const bgCat = document.getElementById("bgCategoryFilter").value.toLowerCase();
  const bgTag = document.getElementById("bgTagFilter").value.toLowerCase();
  LIB.backgrounds
    .filter(b => (!bgCat || b.category.toLowerCase() === bgCat))
    .filter(b => (!bgTag || b.tags.join(" ").toLowerCase().includes(bgTag)))
    .forEach(b => {
      const div = document.createElement("div"); div.className = "thumb";
      div.innerHTML = `<img alt="${b.name}" src="/${b.path}"><div class="label">${b.name}</div>`;
      div.onclick = () => selectedBg = b;
      bgList.appendChild(div);
    });

  const chCat = document.getElementById("charCategoryFilter").value.toLowerCase();
  const chTag = document.getElementById("charTagFilter").value.toLowerCase();
  LIB.characters
    .filter(c => (!chCat || c.category.toLowerCase() === chCat))
    .filter(c => (!chTag || c.tags.join(" ").toLowerCase().includes(chTag)))
    .forEach(c => {
      const div = document.createElement("div"); div.className = "thumb";
      div.innerHTML = `<img alt="${c.name}" src="/${c.path}"><div class="label">${c.name}</div>`;
      div.onclick = () => selectedChar = c;
      charList.appendChild(div);
    });
}

document.addEventListener("change", (e) => {
  if (["bgCategoryFilter","charCategoryFilter"].includes(e.target.id)) renderThumbs();
});
document.addEventListener("input", (e) => {
  if (["bgTagFilter","charTagFilter"].includes(e.target.id)) renderThumbs();
});

function currentTemplate() {
  const id = document.getElementById("templateSelect").value;
  return LIB.templates.find(t => t.id === id);
}

function addPage() {
  const t = currentTemplate();
  const pageDiv = document.createElement("div");
  pageDiv.className = "page";
  const label = document.createElement("div"); label.className = "label";
  label.textContent = `Page ${pages.length + 1} – ${t.name}`;
  const canvasEl = document.createElement("canvas");
  pageDiv.appendChild(label);
  pageDiv.appendChild(canvasEl);
  document.getElementById("pages").appendChild(pageDiv);

  const canvas = new fabric.Canvas(canvasEl, {
    width: t.page.w,
    height: t.page.h,
    backgroundColor: "#fff"
  });

  // Build panels
  const panels = [];
  const bgImagesPerPanel = Array(t.panels.length).fill(null);

  t.panels.forEach((p, idx) => {
    const rect = new fabric.Rect({
      left: p.x, top: p.y, width: p.w, height: p.h,
      hasControls: false, selectable: true, hoverCursor: "pointer",
      strokeDashArray: [6,5], stroke: "#111827", strokeWidth: 3, fill: "rgba(0,0,0,0)"
    });
    rect.panelIndex = idx;
    panels.push(rect);
    canvas.add(rect);
  });

  // Bring panel outlines to front
  function bringOutlinesFront() {
    panels.forEach(r => canvas.bringToFront(r));
  }

  canvas.on("mouse:down", (e) => {
    if (e.target && e.target.panelIndex !== undefined) {
      canvas.setActiveObject(e.target);
    }
  });

  // When adding characters, lock aspect ratio
  function addCharacter(c, panelIdx) {
    fabric.Image.fromURL("/" + c.path, (img) => {
      img.set({
        left: panels[panelIdx].left + panels[panelIdx].width/2 - 80,
        top: panels[panelIdx].top + panels[panelIdx].height/2 - 80,
        scaleX: 0.25, scaleY: 0.25,
        cornerStyle: "circle",
        transparentCorners: false
      });
      img.lockUniScaling = True = true; // ensure uniform scaling
      // Limit movement to within panel bounds (soft via event)
      img.on("moving", () => {
        const p = panels[panelIdx];
        img.left = Math.min(Math.max(img.left, p.left), p.left + p.width - img.width * img.scaleX);
        img.top = Math.min(Math.max(img.top, p.top), p.top + p.height - img.height * img.scaleY);
      });
      canvas.add(img);
      bringOutlinesFront();
    }, { crossOrigin: "anonymous" });
  }

  pages.push({ canvas, panels, bgImagesPerPanel, bringOutlinesFront });
}

document.getElementById("addPageBtn").onclick = () => addPage();

document.getElementById("setBgBtn").onclick = () => {
  if (!selectedBg) { alert("Pick a background first."); return; }
  const p = pages[pages.length - 1]; // last page active by default
  const canvas = p.canvas;
  const active = canvas.getActiveObject();
  if (!active || active.panelIndex === undefined) { alert("Select a panel (click its dashed box)."); return; }
  const idx = active.panelIndex;
  const rect = p.panels[idx];

  fabric.Image.fromURL("/" + selectedBg.path, (img) => {
    // Scale image to panel size (cover)
    const scale = Math.max(rect.width / img.width, rect.height / img.height);
    img.set({
      left: rect.left,
      top: rect.top,
      scaleX: scale,
      scaleY: scale,
      selectable: false,
      evented: false
    });
    // Remove previous bg for this panel
    if (p.bgImagesPerPanel[idx]) canvas.remove(p.bgImagesPerPanel[idx]);
    p.bgImagesPerPanel[idx] = img;
    canvas.add(img);
    canvas.sendToBack(img);
    p.bringOutlinesFront();
    canvas.requestRenderAll();
  }, { crossOrigin: "anonymous" });
};

document.getElementById("addCharBtn").onclick = () => {
  if (!selectedChar) { alert("Pick a character first."); return; }
  const p = pages[pages.length - 1];
  const canvas = p.canvas;
  const active = canvas.getActiveObject();
  const panelIdx = (active && active.panelIndex !== undefined) ? active.panelIndex : 0;
  // add to detected/first panel
  const rect = p.panels[panelIdx];
  fabric.Image.fromURL("/" + selectedChar.path, (img) => {
    const maxW = rect.width * 0.4;
    const scale = maxW / img.width;
    img.set({
      left: rect.left + rect.width*0.3,
      top: rect.top + rect.height*0.3,
      scaleX: scale, scaleY: scale,
      cornerStyle: "circle",
      transparentCorners: false
    });
    img.lockUniScaling = true;
    canvas.add(img);
    p.bringOutlinesFront();
  }, { crossOrigin: "anonymous" });
};

document.getElementById("exportBtn").onclick = async () => {
  // Collect each page canvas -> PNG data URL
  const pagesData = pages.map(p => p.canvas.toDataURL({ format: "png", multiplier: 1 }));
  const res = await fetch("/export", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ pages: pagesData })
  });
  const out = await res.json();
  if (out.ok) {
    window.location.href = out.url;
  } else {
    alert("Export failed: " + out.error);
  }
};

window.addEventListener("load", loadLibrary);
