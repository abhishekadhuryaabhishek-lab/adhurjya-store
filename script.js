// Main JavaScript for Adhurjya Store theme switching and custom logic

// ---------- GLOBAL HELPERS ----------
const { PDFDocument } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

function openTool(slug){
  document.getElementById('home-section').style.display='none';
  document.querySelectorAll('.tool-panel').forEach(p=>p.style.display='none');
  const panel=document.getElementById('panel-'+slug);
  if(panel){panel.style.display='block';window.scrollTo({top:0,behavior:'smooth'});}
}
function goHome(){
  document.querySelectorAll('.tool-panel').forEach(p=>p.style.display='none');
  document.getElementById('home-section').style.display='block';
  window.scrollTo({top:0,behavior:'smooth'});
}

function bytesToKB(bytes){
  return (bytes/1024).toFixed(1);
}
function dataURLToUint8Array(dataURL){
  const base64 = dataURL.split(',')[1];
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
  return arr;
}
function blobFromDataURL(dataURL){
  const arr = dataURLToUint8Array(dataURL);
  const mime = dataURL.substring(dataURL.indexOf(':')+1,dataURL.indexOf(';'));
  return new Blob([arr],{type:mime});
}
function downloadBlob(blob,filename){
  const url = URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function readFileAsDataURL(file){
  return new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onload=()=>resolve(fr.result);
    fr.onerror=reject;
    fr.readAsDataURL(file);
  });
}
function loadImageFromDataURL(dataURL){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=reject;
    img.src=dataURL;
  });
}
async function loadImageFromFile(file){
  const url = await readFileAsDataURL(file);
  return loadImageFromDataURL(url);
}

// ---------- 1. PHOTO → PDF ----------
let photoPdfFiles = [];

document.getElementById('photoPdf-input').addEventListener('change', (e)=>{
  const files = Array.from(e.target.files || []);
  if(!files.length)return;
  photoPdfFiles = photoPdfFiles.concat(files);
  renderPhotoPdfList();
});

function renderPhotoPdfList(){
  const listEl=document.getElementById('photoPdf-list');
  listEl.innerHTML='';
  if(!photoPdfFiles.length){
    listEl.innerHTML='<div class="hint">No images selected yet.</div>';
    return;
  }
  photoPdfFiles.forEach((file,idx)=>{
    const item=document.createElement('div');
    item.className='thumb-item';
    const imgEl=document.createElement('img');
    const meta=document.createElement('div');
    meta.className='thumb-meta';
    const nameDiv=document.createElement('div');
    nameDiv.textContent=file.name;
    const small=document.createElement('small');
    small.textContent=bytesToKB(file.size)+' KB';
    meta.appendChild(nameDiv);meta.appendChild(small);
    const actions=document.createElement('div');
    actions.className='thumb-actions';
    const up=document.createElement('button');
    up.className='icon-btn';up.textContent='↑';
    up.disabled = idx===0;
    up.onclick=()=>{swapInArray(photoPdfFiles,idx,idx-1);renderPhotoPdfList();};
    const down=document.createElement('button');
    down.className='icon-btn';down.textContent='↓';
    down.disabled = idx===photoPdfFiles.length-1;
    down.onclick=()=>{swapInArray(photoPdfFiles,idx,idx+1);renderPhotoPdfList();};
    const del=document.createElement('button');
    del.className='icon-btn';del.textContent='✕';
    del.onclick=()=>{photoPdfFiles.splice(idx,1);renderPhotoPdfList();};
    actions.appendChild(up);actions.appendChild(down);actions.appendChild(del);
    item.appendChild(imgEl);item.appendChild(meta);item.appendChild(actions);
    listEl.appendChild(item);
    readFileAsDataURL(file).then(url=>{imgEl.src=url;}).catch(()=>{});
  });
}
function swapInArray(arr,i,j){
  const t=arr[i];arr[i]=arr[j];arr[j]=t;
}

async function generatePhotoPdf(){
  const status=document.getElementById('photoPdf-status');
  const link=document.getElementById('photoPdf-download');
  link.style.display='none';link.href='#';
  status.textContent='';
  if(!photoPdfFiles.length){
    status.textContent='Please select at least one image.';
    status.className='status error';
    return;
  }
  const maxDim = parseInt(document.getElementById('photoPdf-maxDim').value)||1600;
  const quality = parseFloat(document.getElementById('photoPdf-quality').value)||0.7;
  try{
    status.textContent='Processing images and building PDF...';
    status.className='status';
    const pdfDoc = await PDFDocument.create();
    for(let idx=0;idx<photoPdfFiles.length;idx++){
      const file = photoPdfFiles[idx];
      status.textContent=`Processing image ${idx+1} of ${photoPdfFiles.length}...`;
      const img = await loadImageFromFile(file);
      const ratio = Math.min(1,maxDim/Math.max(img.width,img.height));
      const w = Math.round(img.width*ratio);
      const h = Math.round(img.height*ratio);
      const canvas=document.createElement('canvas');
      canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0,w,h);
      const dataURL = canvas.toDataURL('image/jpeg',quality);
      const bytes = dataURLToUint8Array(dataURL);
      const embedded = await pdfDoc.embedJpg(bytes);
      const page = pdfDoc.addPage([embedded.width,embedded.height]);
      page.drawImage(embedded,{x:0,y:0,width:embedded.width,height:embedded.height});
    }
    status.textContent='Finalizing PDF...';
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes],{type:'application/pdf'});
    const url = URL.createObjectURL(blob);
    link.href=url;
    link.style.display='inline-flex';
    link.onclick=()=>{setTimeout(()=>URL.revokeObjectURL(url),2000);};
    status.textContent=`Done. Estimated size: ${bytesToKB(blob.size)} KB`;
    status.className='status success';
  }catch(err){
    console.error(err);
    status.textContent='Something went wrong while generating the PDF.';
    status.className='status error';
  }
}

// ---------- 2. PHOTO COMPRESSOR ----------
let compressOriginalUrl=null;
document.getElementById('compress-quality').addEventListener('input',(e)=>{
  document.getElementById('compress-quality-label').textContent = Math.round(parseFloat(e.target.value)*100);
});
document.getElementById('compress-input').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  const originalSizeEl=document.getElementById('compress-original-size');
  const preview=document.getElementById('compress-original-preview');
  if(!file){originalSizeEl.textContent='–';preview.src='';return;}
  originalSizeEl.textContent=bytesToKB(file.size);
  compressOriginalUrl = await readFileAsDataURL(file);
  preview.src = compressOriginalUrl;
});

async function compressPhoto(){
  const input=document.getElementById('compress-input');
  const file=input.files[0];
  const statusOriginal=document.getElementById('compress-original-size');
  const statusNew=document.getElementById('compress-new-size');
  const previewNew=document.getElementById('compress-new-preview');
  const link=document.getElementById('compress-download');
  link.style.display='none';link.href='#';
  statusNew.textContent='–';
  if(!file){
    alert('Please select an image first.');
    return;
  }
  try{
    const quality = parseFloat(document.getElementById('compress-quality').value)||0.7;
    const maxW = parseInt(document.getElementById('compress-maxW').value)||null;
    const maxH = parseInt(document.getElementById('compress-maxH').value)||null;
    const img = await loadImageFromFile(file);
    let w=img.width,h=img.height;
    if(maxW || maxH){
      const ratio = Math.min(
        maxW ? maxW/w : 1,
        maxH ? maxH/h : 1
      );
      if(ratio<1){w=Math.round(w*ratio);h=Math.round(h*ratio);}
    }
    const canvas=document.createElement('canvas');
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(img,0,0,w,h);
    const dataURL = canvas.toDataURL('image/jpeg',quality);
    const blob = blobFromDataURL(dataURL);
    const url=URL.createObjectURL(blob);
    previewNew.src=url;
    statusOriginal.textContent=bytesToKB(file.size);
    statusNew.textContent=bytesToKB(blob.size);
    link.href=url;
    link.download='compressed.jpg';
    link.style.display='inline-flex';
    const status = document.getElementById('compress-original-size').parentElement.parentElement.parentElement;
    if(status) status.textContent=`Compressed: ${bytesToKB(blob.size)} KB`;
  }catch(err){
    console.error(err);
    alert('Compression failed.');
  }
}

// ---------- 3. IMAGE RESIZER ----------
let resizeImageFile=null;
document.getElementById('resize-input').addEventListener('change', async (e)=>{
  const file=e.target.files[0];
  const wEl=document.getElementById('resize-width');
  const hEl=document.getElementById('resize-height');
  const originalPrev=document.getElementById('resize-original-preview');
  const status=document.getElementById('resize-status');
  document.getElementById('resize-download').style.display='none';
  document.getElementById('resize-new-preview').src='';
  if(!file){originalPrev.src='';status.textContent='';return;}
  try{
    const dataURL=await readFileAsDataURL(file);
    resizeImageFile=file;
    const img=await loadImageFromDataURL(dataURL);
    originalPrev.src=dataURL;
    wEl.value=img.width;
    hEl.value=img.height;
    status.textContent=`Original: ${img.width}×${img.height}`;
    status.className='status';
  }catch(err){
    console.error(err);
    status.textContent='Could not load image.';
    status.className='status error';
  }
});

document.getElementById('resize-width').addEventListener('input',()=>{
  syncResizeAspect(true);
});
document.getElementById('resize-height').addEventListener('input',()=>{
  syncResizeAspect(false);
});

async function syncResizeAspect(widthChanged){
  if(!resizeImageFile) return;
  const keep=document.getElementById('resize-keep-aspect').checked;
  if(!keep)return;
  const wEl=document.getElementById('resize-width');
  const hEl=document.getElementById('resize-height');
  const dataURL=await readFileAsDataURL(resizeImageFile);
  const img=await loadImageFromDataURL(dataURL);
  const aspect = img.width/img.height;
  if(widthChanged){
    const w=parseInt(wEl.value)||img.width;
    hEl.value=Math.round(w/aspect);
  }else{
    const h=parseInt(hEl.value)||img.height;
    wEl.value=Math.round(h*aspect);
  }
}

async function resizeImage(){
  const file=resizeImageFile;
  const w=parseInt(document.getElementById('resize-width').value);
  const h=parseInt(document.getElementById('resize-height').value);
  const status=document.getElementById('resize-status');
  const link=document.getElementById('resize-download');
  const newPrev=document.getElementById('resize-new-preview');
  link.style.display='none';newPrev.src='';
  if(!file){status.textContent='Please select an image first.';status.className='status error';return;}
  if(!w || !h){status.textContent='Please enter valid width and height.';status.className='status error';return;}
  try{
    const img=await loadImageFromFile(file);
    const canvas=document.createElement('canvas');
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';
    ctx.drawImage(img,0,0,w,h);
    const dataURL=canvas.toDataURL('image/png');
    const blob=blobFromDataURL(dataURL);
    const url=URL.createObjectURL(blob);
    newPrev.src=url;
    link.href=url;
    link.download='resized.png';
    link.style.display='inline-flex';
    status.textContent=`Resized to ${w}×${h}`;
    status.className='status success';
  }catch(err){
    console.error(err);
    status.textContent='Resizing failed.';
    status.className='status error';
  }
}

// ---------- 5. OCR (IMAGE + PDF, PRE-PROCESSED) ----------
async function runOcr(){
  const input=document.getElementById('ocr-input');
  const file=input.files[0];
  const lang=document.getElementById('ocr-lang').value;
  const status=document.getElementById('ocr-status');
  const out=document.getElementById('ocr-output');
  const bar=document.getElementById('ocr-progress-bar');
  const inner=document.getElementById('ocr-progress-inner');
  out.value='';
  inner.style.width='0%';
  bar.style.display='none';
  if(!file){
    status.textContent='Please select an image or PDF first.';
    status.className='status error';
    return;
  }
  status.textContent='Loading OCR engine and preparing input...';
  status.className='status';
  const T = window.Tesseract;
  try{
    bar.style.display='block';
    if(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')){
      // PDF OCR
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({data:arrayBuffer}).promise;
      const totalPages = pdf.numPages;
      let allText = [];
      for(let pageNum=1; pageNum<=totalPages; pageNum++){
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({scale:2}); // higher DPI for better OCR
        const canvas=document.createElement('canvas');
        const ctx=canvas.getContext('2d');
        canvas.width=viewport.width;
        canvas.height=viewport.height;
        await page.render({canvasContext:ctx,viewport}).promise;

        status.textContent=`Running OCR on page ${pageNum} of ${totalPages}...`;
        const result = await T.recognize(canvas, lang, {
          logger:m=>{
            if(m.status==='recognizing text' && m.progress){
              const global = ((pageNum-1) + m.progress)/totalPages*100;
              inner.style.width = global.toFixed(0)+'%';
            }
          }
        });
        allText.push(`--- Page ${pageNum} ---\n`+(result.data.text || '').trim());
      }
      out.value = allText.join('\n\n');
      status.textContent='OCR finished for all pages. Review and edit if needed.';
      status.className='status success';
    }else{
      // IMAGE OCR with pre-processing
      const dataURL = await readFileAsDataURL(file);
      const img = await loadImageFromDataURL(dataURL);

      // Preprocess: upscale to at least 1500px on longer side, grayscale, contrast
      const maxDim = 1800;
      const needScale = maxDim / Math.max(img.width, img.height);
      const scale = needScale < 1 ? needScale : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas=document.createElement('canvas');
      const ctx=canvas.getContext('2d');
      canvas.width=w;canvas.height=h;
      ctx.drawImage(img,0,0,w,h);

      let imgData = ctx.getImageData(0,0,w,h);
      let d = imgData.data;
      const c = 1.2; // mild contrast boost
      const intercept = 128*(1-c);
      for(let i=0;i<d.length;i+=4){
        let r=d[i], g=d[i+1], b=d[i+2];
        let grey = 0.299*r+0.587*g+0.114*b;
        grey = c*grey + intercept + 5; // little brighten
        grey = Math.max(0,Math.min(255,grey));
        d[i]=d[i+1]=d[i+2]=grey;
      }
      ctx.putImageData(imgData,0,0);

      status.textContent='Running OCR on image...';
      const result = await T.recognize(canvas, lang, {
        logger:m=>{
          if(m.status==='recognizing text' && m.progress){
            inner.style.width = (m.progress*100).toFixed(0)+'%';
          }
        }
      });
      out.value = result.data.text || '';
      status.textContent='OCR finished. Check and edit if needed.';
      status.className='status success';
    }
  }catch(err){
    console.error(err);
    status.textContent='OCR failed. Try a clearer scan, or check that language data is available.';
    status.className='status error';
    bar.style.display='none';
  }
}

async function copyOcrText(){
  const txt=document.getElementById('ocr-output').value;
  if(!txt){alert('No text to copy.');return;}
  try{
    await navigator.clipboard.writeText(txt);
    alert('Copied to clipboard.');
  }catch{
    alert('Could not copy automatically. Please select and copy manually.');
  }
}

// ---------- 6. PDF COMPRESSOR ----------
async function compressPdf(){
  const input=document.getElementById('pdfc-input');
  const file=input.files[0];
  const status=document.getElementById('pdfc-status');
  const link=document.getElementById('pdfc-download');
  link.style.display='none';link.href='#';
  if(!file){
    status.textContent='Please select a PDF file.';
    status.className='status error';
    return;
  }
  status.textContent='Loading PDF...';
  status.className='status';
  try{
    const preset=document.getElementById('pdfc-quality').value;
    let scale=1,quality=0.8;
    if(preset==='high'){scale=1;quality=0.9;}
    else if(preset==='medium'){scale=0.9;quality=0.75;}
    else{scale=0.8;quality=0.6;}
    const arrayBuffer=await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data:arrayBuffer}).promise;
    const pageCount=pdf.numPages;
    status.textContent=`Rendering ${pageCount} page(s)... this may take a while.`;
    const newDoc = await PDFDocument.create();
    for(let i=1;i<=pageCount;i++){
      status.textContent=`Rendering page ${i} of ${pageCount}...`;
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({scale:scale});
      const canvas=document.createElement('canvas');
      const ctx=canvas.getContext('2d');
      canvas.width=viewport.width;
      canvas.height=viewport.height;
      await page.render({canvasContext:ctx,viewport}).promise;
      const dataURL=canvas.toDataURL('image/jpeg',quality);
      const bytes=dataURLToUint8Array(dataURL);
      const embedded=await newDoc.embedJpg(bytes);
      const p=newDoc.addPage([embedded.width,embedded.height]);
      p.drawImage(embedded,{x:0,y:0,width:embedded.width,height:embedded.height});
    }
    status.textContent='Building compressed PDF...';
    const newBytes=await newDoc.save();
    const blob=new Blob([newBytes],{type:'application/pdf'});
    const url=URL.createObjectURL(blob);
    link.href=url;
    link.style.display='inline-flex';
    link.onclick=()=>{setTimeout(()=>URL.revokeObjectURL(url),2000);};
    status.textContent=`Done. Original: ${bytesToKB(file.size)} KB • Compressed: ${bytesToKB(blob.size)} KB`;
    status.className='status success';
  }catch(err){
    console.error(err);
    status.textContent='Compression failed. PDF may be too complex or large for browser processing.';
    status.className='status error';
  }
}

// ---------- 7. MERGE PDF ----------
let mergePdfsFiles=[];
document.getElementById('merge-input').addEventListener('change',(e)=>{
  const files=Array.from(e.target.files||[]);
  mergePdfsFiles = mergePdfsFiles.concat(files);
  renderMergeList();
});
function renderMergeList(){
  const list=document.getElementById('merge-list');
  list.innerHTML='';
  if(!mergePdfsFiles.length){
    list.innerHTML='<div class="hint">No PDFs selected yet.</div>';
    return;
  }
  mergePdfsFiles.forEach((file,idx)=>{
    const item=document.createElement('div');
    item.className='thumb-item';
    const icon=document.createElement('div');
    icon.className='pill-small';
    icon.textContent='PDF';
    const meta=document.createElement('div');
    meta.className='thumb-meta';
    const name=document.createElement('div');
    name.textContent=file.name;
    const size=document.createElement('small');
    size.textContent=bytesToKB(file.size)+' KB';
    meta.appendChild(name);meta.appendChild(size);
    const actions=document.createElement('div');
    actions.className='thumb-actions';
    const up=document.createElement('button');
    up.className='icon-btn';up.textContent='↑';up.disabled=idx===0;
    up.onclick=()=>{swapInArray(mergePdfsFiles,idx,idx-1);renderMergeList();};
    const down=document.createElement('button');
    down.className='icon-btn';down.textContent='↓';down.disabled=idx===mergePdfsFiles.length-1;
    down.onclick=()=>{swapInArray(mergePdfsFiles,idx,idx+1);renderMergeList();};
    const del=document.createElement('button');
    del.className='icon-btn';del.textContent='✕';
    del.onclick=()=>{mergePdfsFiles.splice(idx,1);renderMergeList();};
    actions.appendChild(up);actions.appendChild(down);actions.appendChild(del);
    item.appendChild(icon);item.appendChild(meta);item.appendChild(actions);
    list.appendChild(item);
  });
}

async function mergePdfs(){
  const status=document.getElementById('merge-status');
  const link=document.getElementById('merge-download');
  link.style.display='none';link.href='#';
  if(!mergePdfsFiles.length){
    status.textContent='Please add at least two PDFs.';
    status.className='status error';
    return;
  }
  try{
    status.textContent='Merging PDFs...';
    status.className='status';
    const merged = await PDFDocument.create();
    for(let i=0;i<mergePdfsFiles.length;i++){
      status.textContent=`Merging file ${i+1} of ${mergePdfsFiles.length}...`;
      const file=mergePdfsFiles[i];
      const bytes = new Uint8Array(await file.arrayBuffer());
      const srcDoc = await PDFDocument.load(bytes);
      const indices = srcDoc.getPageIndices();
      const pages = await merged.copyPages(srcDoc,indices);
      pages.forEach(p=>merged.addPage(p));
    }
    const outBytes=await merged.save();
    const blob=new Blob([outBytes],{type:'application/pdf'});
    const url=URL.createObjectURL(blob);
    link.href=url;
    link.style.display='inline-flex';
    link.onclick=()=>{setTimeout(()=>URL.revokeObjectURL(url),2000);};
    status.textContent=`Done. Pages merged: ${mergePdfsFiles.length} file(s).`;
    status.className='status success';
  }catch(err){
    console.error(err);
    status.textContent='Merge failed. Check PDF files and try again.';
    status.className='status error';
  }
}

// ---------- 8. PDF TO IMAGE ----------
async function pdfToImages(){
  const input=document.getElementById('p2i-input');
  const file=input.files[0];
  const fromEl=document.getElementById('p2i-from');
  const toEl=document.getElementById('p2i-to');
  const type=document.getElementById('p2i-type').value;
  const status=document.getElementById('p2i-status');
  const gallery=document.getElementById('p2i-gallery');
  gallery.innerHTML='';
  if(!file){
    status.textContent='Please select a PDF.';
    status.className='status error';
    return;
  }
  try{
    const arrayBuffer=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:arrayBuffer}).promise;
    const total=pdf.numPages;
    let from=parseInt(fromEl.value)||1;
    let to=parseInt(toEl.value)||total;
    from=Math.max(1,Math.min(from,total));
    to=Math.max(from,Math.min(to,total));
    status.textContent=`Rendering pages ${from} to ${to}...`;
    status.className='status';
    for(let pageNum=from;pageNum<=to;pageNum++){
      const page=await pdf.getPage(pageNum);
      const viewport=page.getViewport({scale:1});
      const canvas=document.createElement('canvas');
      const ctx=canvas.getContext('2d');
      canvas.width=viewport.width;
      canvas.height=viewport.height;
      await page.render({canvasContext:ctx,viewport}).promise;
      const dataURL=canvas.toDataURL('image/'+type,0.9);
      const blob=blobFromDataURL(dataURL);
      const url=URL.createObjectURL(blob);

      const card=document.createElement('div');
      card.className='section';
      const title=document.createElement('div');
      title.className='section-title';
      title.textContent='Page '+pageNum;
      const img=document.createElement('img');
      img.src=url;
      img.className='preview-img mt-xs';
      const a=document.createElement('a');
      a.className='download-link';
      a.href=url;
      a.download=`page-${pageNum}.${type==='png'?'png':'jpg'}`;
      a.textContent='⬇ Download image';
      card.appendChild(title);
      card.appendChild(img);
      card.appendChild(a);
      gallery.appendChild(card);
    }
    status.textContent='Pages rendered. Scroll down to download images.';
    status.className='status success';
  }catch(err){
    console.error(err);
    status.textContent='Conversion failed. PDF may be too heavy for this device.';
    status.className='status error';
  }
}

// ---------- 9. IMAGE FORMAT CONVERTER ----------
document.getElementById('fmt-quality').addEventListener('input',(e)=>{
  document.getElementById('fmt-quality-label').textContent=Math.round(parseFloat(e.target.value)*100);
});

let fmtImageFile=null;
document.getElementById('fmt-input').addEventListener('change', async (e)=>{
  const file=e.target.files[0];
  const preview=document.getElementById('fmt-preview');
  const status=document.getElementById('fmt-status');
  document.getElementById('fmt-download').style.display='none';
  if(!file){preview.src='';status.textContent='';return;}
  fmtImageFile=file;
  preview.src=await readFileAsDataURL(file);
  status.textContent=`Selected: ${file.name} (${bytesToKB(file.size)} KB)`;
  status.className='status';
});

async function convertFormat(){
  const file=fmtImageFile;
  const outFmt=document.getElementById('fmt-output').value;
  const q=parseFloat(document.getElementById('fmt-quality').value)||0.85;
  const status=document.getElementById('fmt-status');
  const preview=document.getElementById('fmt-preview');
  const link=document.getElementById('fmt-download');
  link.style.display='none';
  if(!file){
    status.textContent='Please select an image first.';
    status.className='status error';
    return;
  }
  try{
    status.textContent='Converting...';
    status.className='status';
    const img=await loadImageFromFile(file);
    const canvas=document.createElement('canvas');
    canvas.width=img.width;
    canvas.height=img.height;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(img,0,0);
    const mime=outFmt;
    const needQuality = (mime==='image/jpeg' || mime==='image/webp');
    const dataURL=canvas.toDataURL(mime,needQuality?q:undefined);
    const blob=blobFromDataURL(dataURL);
    const url=URL.createObjectURL(blob);
    preview.src=url;
    let ext='png';
    if(mime==='image/jpeg')ext='jpg';
    else if(mime==='image/webp')ext='webp';
    link.href=url;
    link.download=`converted.${ext}`;
    link.style.display='inline-flex';
    status.textContent=`Converted size: ${bytesToKB(blob.size)} KB`;
    status.className='status success';
  }catch(err){
    console.error(err);
    status.textContent='Conversion failed (format may not be supported on this browser).';
    status.className='status error';
  }
}

// ---------- 12. PHOTO / PDF → TABLE → CSV (Photo to Excel lite) ----------
let photoExcelCsvUrl = null;

function buildCsvFromPlainText(text){
  // 1) split into lines, empty line বাদ
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const rows = [];

  for(const line of lines){
    let cells = [];

    if (line.includes('\t')) {
      // tab-separated
      cells = line.split(/\t+/);
    } else if (line.includes('|')) {
      // pipe-separated tables (A | B | C)
      cells = line.split(/\s*\|\s*/);
    } else {
      // default: 2+ space → column
      cells = line.split(/\s{2,}/);
    }

    cells = cells.map(c => c.trim()).filter(c => c.length > 0);
    if(!cells.length) continue;

    // CSV escaping: quote if comma / quote / newline
    const csvCells = cells.map(c=>{
      if(/[",\r\n]/.test(c)){
        return '"' + c.replace(/"/g,'""') + '"';
      }
      return c;
    });

    rows.push(csvCells.join(','));
  }

  return rows.join('\r\n');
}

async function runPhotoExcel(){
  const input = document.getElementById('photoExcel-input');
  const file = input.files[0];
  const lang = document.getElementById('photoExcel-lang').value;
  const status = document.getElementById('photoExcel-status');
  const rawOut = document.getElementById('photoExcel-raw');
  const csvOut = document.getElementById('photoExcel-csv');
  const link = document.getElementById('photoExcel-download');

  rawOut.value = '';
  csvOut.value = '';
  link.style.display = 'none';
  link.href = '#';

  if(photoExcelCsvUrl){
    URL.revokeObjectURL(photoExcelCsvUrl);
    photoExcelCsvUrl = null;
  }

  if(!file){
    status.textContent = 'Please select an image or PDF first.';
    status.className = 'status error';
    return;
  }

  status.textContent = 'Preparing OCR...';
  status.className = 'status';

  const T = window.Tesseract;

  try{
    let fullText = '';

    if(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')){
      // ---- PDF TABLE OCR ----
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({data:arrayBuffer}).promise;
      const totalPages = pdf.numPages;

      for(let pageNum=1; pageNum<=totalPages; pageNum++){
        const page = await pdf.getPage(pageNum);

        // একটু higher DPI = better OCR
        const viewport = page.getViewport({scale: 2.0});
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({canvasContext:ctx,viewport}).promise;

        status.textContent = `Running OCR on page ${pageNum} of ${totalPages}...`;

        const result = await T.recognize(canvas, lang, {
          logger: m => {
            if(m.status === 'recognizing text' && m.progress){
              status.textContent = `Page ${pageNum}/${totalPages} – ${(m.progress*100).toFixed(0)}%`;
            }
          }
        });

        const pageText = (result.data.text || '').trim();
        if(pageText.length){
          fullText += (fullText ? '\n\n' : '') + pageText;
        }
      }
    }else{
      // ---- IMAGE TABLE OCR ----
      const dataURL = await readFileAsDataURL(file);
      const img = await loadImageFromDataURL(dataURL);

      // একটু preprocess: grayscale + slight contrast
      const maxDim = 1800;
      const needScale = maxDim / Math.max(img.width, img.height);
      const scale = needScale < 1 ? needScale : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = w; canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      let imgData = ctx.getImageData(0,0,w,h);
      let d = imgData.data;
      const c = 1.2;
      const intercept = 128*(1-c);
      for(let i=0;i<d.length;i+=4){
        let r=d[i], g=d[i+1], b=d[i+2];
        let grey = 0.299*r+0.587*g+0.114*b;
        grey = c*grey + intercept + 5;
        grey = Math.max(0,Math.min(255,grey));
        d[i]=d[i+1]=d[i+2]=grey;
      }
      ctx.putImageData(imgData,0,0);

      status.textContent = 'Running OCR on image table...';

      const result = await T.recognize(canvas, lang, {
        logger: m => {
          if(m.status === 'recognizing text' && m.progress){
            status.textContent = `Recognizing text – ${(m.progress*100).toFixed(0)}%`;
          }
        }
      });

      fullText = (result.data.text || '').trim();
    }

    if(!fullText){
      status.textContent = 'No text detected. Try a clearer scan or higher quality image.';
      status.className = 'status error';
      return;
    }

    rawOut.value = fullText;

    // Build CSV from OCR text
    const csv = buildCsvFromPlainText(fullText);
    csvOut.value = csv || '# No table-like structure detected.\n';

    if(csv && csv.trim().length){
      const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
      photoExcelCsvUrl = URL.createObjectURL(blob);
      link.href = photoExcelCsvUrl;
      link.style.display = 'inline-flex';
      status.textContent = 'Done. Check CSV preview and download for Excel.';
      status.className = 'status success';
    }else{
      status.textContent = 'OCR done, but could not detect clear table columns. You can still copy raw text.';
      status.className = 'status';
    }

  }catch(err){
    console.error(err);
    status.textContent = 'Table OCR failed. Try a clearer table or different language.';
    status.className = 'status error';
  }
}

// ---------- 11. ID PHOTO MAKER ----------
let idImg=null;
let idScale=1;
let crop = {x:0,y:0,w:0,h:0};
let dragging=false;
let dragOffset={x:0,y:0};

const idContainer=document.getElementById('id-crop-container');
const idImgEl=document.getElementById('id-img');
const idCropRect=document.getElementById('id-crop-rect');

document.getElementById('id-input').addEventListener('change', async (e)=>{
  const file=e.target.files[0];
  const status=document.getElementById('id-status');
  document.getElementById('id-download').style.display='none';
  if(!file){idContainer.style.display='none';status.textContent='';return;}
  try{
    const url=await readFileAsDataURL(file);
    idImg=await loadImageFromDataURL(url);
    idImgEl.src=url;
    idContainer.style.display='block';
    status.textContent='Image loaded. Adjust crop box over the face.';
    status.className='status';
    setTimeout(initIdCrop,50);
  }catch(err){
    console.error(err);
    status.textContent='Could not load image.';
    status.className='status error';
  }
});

function initIdCrop(){
  if(!idImg)return;
  const rect=idContainer.getBoundingClientRect();
  const imgRect=idImgEl.getBoundingClientRect();
  idScale=idImg.width/imgRect.width;
  const preset=document.getElementById('id-preset').value.split('x');
  const pw=parseInt(preset[0]),ph=parseInt(preset[1]);
  const aspect=pw/ph;
  let cropW=imgRect.width*0.5;
  let cropH=cropW/aspect;
  if(cropH>imgRect.height*0.7){
    cropH=imgRect.height*0.7;
    cropW=cropH*aspect;
  }
  crop.w=cropW;
  crop.h=cropH;
  crop.x=imgRect.left-rect.left + (imgRect.width-cropW)/2;
  crop.y=imgRect.top-rect.top + (imgRect.height-cropH)/3;
  updateCropRect();
}
function updateCropRect(){
  idCropRect.style.left=crop.x+'px';
  idCropRect.style.top=crop.y+'px';
  idCropRect.style.width=crop.w+'px';
  idCropRect.style.height=crop.h+'px';
}

idCropRect.addEventListener('mousedown',startDrag);
idCropRect.addEventListener('touchstart',startDrag,{passive:false});
window.addEventListener('mousemove',onDrag);
window.addEventListener('touchmove',onDrag,{passive:false});
window.addEventListener('mouseup',endDrag);
window.addEventListener('touchend',endDrag);

function startDrag(e){
  e.preventDefault();
  dragging=true;
  const pos=getDragPos(e);
  dragOffset.x=pos.x-crop.x;
  dragOffset.y=pos.y-crop.y;
}
function getDragPos(e){
  const rect=idContainer.getBoundingClientRect();
  if(e.touches && e.touches[0]){
    return{
      x:e.touches[0].clientX-rect.left,
      y:e.touches[0].clientY-rect.top
    };
  }
  return{
    x:e.clientX-rect.left,
    y:e.clientY-rect.top
  };
}
function onDrag(e){
  if(!dragging)return;
  e.preventDefault();
  const pos=getDragPos(e);
  const imgRect=idImgEl.getBoundingClientRect();
  const contRect=idContainer.getBoundingClientRect();
  const minX=imgRect.left-contRect.left;
  const minY=imgRect.top-contRect.top;
  const maxX=minX+imgRect.width-crop.w;
  const maxY=minY+imgRect.height-crop.h;
  crop.x=Math.min(Math.max(pos.x-dragOffset.x,minX),maxX);
  crop.y=Math.min(Math.max(pos.y-dragOffset.y,minY),maxY);
  updateCropRect();
}
function endDrag(e){
  if(!dragging)return;
  e.preventDefault();
  dragging=false;
}

async function generateIdPhoto(){
  const status=document.getElementById('id-status');
  const link=document.getElementById('id-download');
  link.style.display='none';
  if(!idImg){
    status.textContent='Please select a portrait image first.';
    status.className='status error';
    return;
  }
  const preset=document.getElementById('id-preset').value.split('x');
  const pw=parseInt(preset[0]),ph=parseInt(preset[1]);
  const bg=document.getElementById('id-bg').value;
  let cols=parseInt(document.getElementById('id-cols').value)||1;
  let rows=parseInt(document.getElementById('id-rows').value)||1;
  cols=Math.min(Math.max(cols,1),5);
  rows=Math.min(Math.max(rows,1),6);
  const maxCopies=40;
  let copies=cols*rows;
  if(copies>maxCopies){
    copies=maxCopies;
  }

  const contRect=idContainer.getBoundingClientRect();
  const imgRect=idImgEl.getBoundingClientRect();
  const relX=crop.x - (imgRect.left-contRect.left);
  const relY=crop.y - (imgRect.top-contRect.top);
  const srcX=relX*idScale;
  const srcY=relY*idScale;
  const srcW=crop.w*idScale;
  const srcH=crop.h*idScale;

  const margin=20;
  const gap=20;
  const sheetW = pw*cols + margin*2 + gap*(cols-1);
  const sheetH = ph*rows + margin*2 + gap*(rows-1);

  try{
    const canvas=document.createElement('canvas');
    canvas.width=sheetW;canvas.height=sheetH;
    const ctx=canvas.getContext('2d');

    ctx.fillStyle='#ffffff';
    ctx.fillRect(0,0,sheetW,sheetH);

    let placed=0;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        if(placed>=copies) break;
        const x = margin + c*(pw+gap);
        const y = margin + r*(ph+gap);
        ctx.fillStyle=bg;
        ctx.fillRect(x,y,pw,ph);
        ctx.drawImage(idImg,srcX,srcY,srcW,srcH,x,y,pw,ph);
        placed++;
      }
    }

    canvas.toBlob(blob=>{
      if(!blob){
        status.textContent='Could not build ID photo sheet.';
        status.className='status error';
        return;
      }
      const url=URL.createObjectURL(blob);
      link.href=url;
      link.style.display='inline-flex';
      status.textContent='ID photo sheet ready. Download below and print.';
      status.className='status success';
    },'image/png');
  }catch(err){
    console.error(err);
    status.textContent='ID photo generation failed.';
    status.className='status error';
  }
}

document.getElementById('id-preset').addEventListener('change',()=>{
  if(idImg){initIdCrop();}
});

// ---------- 13. STRONG PASSWORD GENERATOR ----------
(function () {
  const outputEl = document.getElementById("spg-password-output");
  if (!outputEl) return; // safety

  const lengthSlider = document.getElementById("spg-length-slider");
  const lengthValDisplay = document.getElementById("spg-length-val");
  const btnGenerate = document.getElementById("spg-generate-btn");
  const btnCopy = document.getElementById("spg-copy-btn");
  const copyMsg = document.getElementById("spg-copy-msg");
  const errorMsg = document.getElementById("spg-error-msg");
  const strengthLabel = document.getElementById("spg-strength-label");
  const strengthBarFill = document.getElementById("spg-strength-bar-fill");

  const checkUpper = document.getElementById("spg-check-upper");
  const checkLower = document.getElementById("spg-check-lower");
  const checkNumber = document.getElementById("spg-check-numbers");
  const checkSymbol = document.getElementById("spg-check-symbols");

  // Character sets (no confusing chars)
  const charsUpper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const charsLower = "abcdefghijkmnpqrstuvwxyz";
  const charsNum = "23456789";
  const charsSym = "!@#$%^&*()_+~`|}{[]:;?><,.-=";

  function generatePassword() {
    const length = parseInt(lengthSlider.value, 10);
    let allowedChars = "";
    let passwordArray = [];

    // reset error
    errorMsg.textContent = "";

    if (checkUpper.checked) {
      allowedChars += charsUpper;
      passwordArray.push(getRandomChar(charsUpper));
    }
    if (checkLower.checked) {
      allowedChars += charsLower;
      passwordArray.push(getRandomChar(charsLower));
    }
    if (checkNumber.checked) {
      allowedChars += charsNum;
      passwordArray.push(getRandomChar(charsNum));
    }
    if (checkSymbol.checked) {
      allowedChars += charsSym;
      passwordArray.push(getRandomChar(charsSym));
    }

    // nothing selected
    if (!allowedChars) {
      outputEl.value = "";
      updateStrengthMeter("");
      errorMsg.textContent =
        "Please select at least one option. (অনুগ্রহ করে একটি বিকল্প নির্বাচন করুন)";
      return;
    }

    const remainingLength = length - passwordArray.length;
    for (let i = 0; i < remainingLength; i++) {
      passwordArray.push(getRandomChar(allowedChars));
    }

    const finalPassword = shuffleArray(passwordArray).join("");
    outputEl.value = finalPassword;
    updateStrengthMeter(finalPassword);
  }

  function getRandomChar(charString) {
    const randomBuffer = new Uint32Array(1);
    window.crypto.getRandomValues(randomBuffer);
    const randomNumber = randomBuffer[0] / (0xffffffff + 1);
    const randomIndex = Math.floor(randomNumber * charString.length);
    return charString[randomIndex];
  }

  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const randomBuffer = new Uint32Array(1);
      window.crypto.getRandomValues(randomBuffer);
      const j = Math.floor(
        (randomBuffer[0] / (0xffffffff + 1)) * (i + 1)
      );
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function updateLengthDisplay() {
    lengthValDisplay.textContent = lengthSlider.value;
  }

  function copyToClipboard() {
    const password = outputEl.value;
    if (!password) return;

    navigator.clipboard
      .writeText(password)
      .then(() => {
        copyMsg.style.opacity = "1";
        setTimeout(() => {
          copyMsg.style.opacity = "0";
        }, 1500);
      })
      .catch((err) => {
        console.error("Failed to copy: ", err);
      });
  }

  function updateStrengthMeter(password) {
    if (!password) {
      strengthLabel.textContent = "Strength: —";
      strengthBarFill.style.width = "0%";
      return;
    }

    let score = 0;

    // length points
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;

    // variety points
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);

    if (hasUpper) score += 1;
    if (hasLower) score += 1;
    if (hasNumber) score += 1;
    if (hasSymbol) score += 1;

    let strengthText = "Weak (দুর্বল)";
    let width = "20%";

    if (score >= 3 && score < 5) {
      strengthText = "Okay (মাঝারি)";
      width = "45%";
    } else if (score >= 5 && score < 7) {
      strengthText = "Strong (শক্তিশালী)";
      width = "75%";
    } else if (score === 7) {
      strengthText = "Ultra Strong (অত্যন্ত শক্তিশালী)";
      width = "100%";
    }

    strengthLabel.textContent = "Strength: " + strengthText;
    strengthBarFill.style.width = width;
  }

  // events
  btnGenerate.addEventListener("click", generatePassword);
  btnCopy.addEventListener("click", copyToClipboard);

  lengthSlider.addEventListener("input", () => {
    updateLengthDisplay();
    generatePassword();
  });

  [checkUpper, checkLower, checkNumber, checkSymbol].forEach((el) => {
    el.addEventListener("change", generatePassword);
  });

  // init
  updateLengthDisplay();
  generatePassword();
})();

// ---------- PDF SPLIT & EDIT (PAGES) ----------
let pdfPagesOriginalBytes = null;
let pdfPagesState = []; // [{ id, originalIndex, rotation, thumb }]
let pdfPagesTotalPages = 0;

const pdfPagesInputEl = document.getElementById('pdfPages-input');
if (pdfPagesInputEl) {
  pdfPagesInputEl.addEventListener('change', handlePdfPagesFile);
  document
    .getElementById('pdfPages-split-btn')
    .addEventListener('click', handlePdfPagesSplit);
  document
    .getElementById('pdfPages-download-edited-btn')
    .addEventListener('click', handlePdfPagesDownloadEdited);
}

function resetPdfPagesUI() {
  const grid = document.getElementById('pdfPages-thumb-grid');
  if (grid) grid.innerHTML = '';
  const splitStatus = document.getElementById('pdfPages-split-status');
  if (splitStatus) splitStatus.textContent = '';
  const editorStatus = document.getElementById('pdfPages-editor-status');
  if (editorStatus) editorStatus.textContent = '';
}

async function handlePdfPagesFile(e) {
  const file = e.target.files[0];
  const status = document.getElementById('pdfPages-status');
  const pageCountLabel = document.getElementById('pdfPages-page-count');
  const editorStatus = document.getElementById('pdfPages-editor-status');

  resetPdfPagesUI();
  pdfPagesOriginalBytes = null;
  pdfPagesState = [];
  pdfPagesTotalPages = 0;

  if (!file) {
    if (status) {
      status.textContent = 'Please select a PDF file.';
      status.className = 'status error';
    }
    if (pageCountLabel) pageCountLabel.textContent = 'No PDF loaded';
    return;
  }

  try {
    if (status) {
      status.textContent = 'Loading PDF...';
      status.className = 'status';
    }

    pdfPagesOriginalBytes = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjsLib.getDocument({ data: pdfPagesOriginalBytes });
    const pdf = await loadingTask.promise;

    pdfPagesTotalPages = pdf.numPages;
    pdfPagesState = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const maxThumbWidth = 120;
      const scale = Math.min(1, maxThumbWidth / viewport.width);
      const thumbViewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = thumbViewport.width;
      canvas.height = thumbViewport.height;

      await page.render({ canvasContext: ctx, viewport: thumbViewport }).promise;
      const dataURL = canvas.toDataURL('image/jpeg', 0.7);

      pdfPagesState.push({
        id: 'p' + pageNum,
        originalIndex: pageNum - 1, // 0-based index in original PDF
        rotation: 0,
        thumb: dataURL
      });
    }

    renderPdfPagesThumbs();

    if (pageCountLabel) {
      pageCountLabel.textContent = `${pdfPagesState.length} page(s) loaded`;
    }
    if (editorStatus) {
      editorStatus.textContent = 'Pages ready. Use the controls on each page to edit.';
      editorStatus.className = 'status';
    }
    if (status) {
      status.textContent = `Loaded PDF with ${pdfPagesTotalPages} page(s).`;
      status.className = 'status success';
    }
  } catch (err) {
    console.error(err);
    pdfPagesOriginalBytes = null;
    pdfPagesState = [];
    pdfPagesTotalPages = 0;

    if (status) {
      status.textContent = 'Could not read this PDF in the browser.';
      status.className = 'status error';
    }
    if (pageCountLabel) pageCountLabel.textContent = 'No PDF loaded';
  }
}

function renderPdfPagesThumbs() {
  const grid = document.getElementById('pdfPages-thumb-grid');
  const label = document.getElementById('pdfPages-page-count');
  if (!grid) return;

  grid.innerHTML = '';

  if (!pdfPagesState.length) {
    grid.innerHTML = '<div class="hint">No pages to show. Upload a PDF above.</div>';
    if (label) label.textContent = 'No PDF loaded';
    return;
  }

  pdfPagesState.forEach((pageState, idx) => {
    const card = document.createElement('div');
    card.className = 'pdfPages-pageCard';

    const header = document.createElement('div');
    header.className = 'pdfPages-pageHeader';

    const title = document.createElement('div');
    title.className = 'pdfPages-pageTitle';
    title.textContent = `Page ${idx + 1}`;

    const rotateLabel = document.createElement('div');
    rotateLabel.className = 'pdfPages-rotateLabel';
    rotateLabel.textContent = pageState.rotation ? `${pageState.rotation}°` : '0°';

    header.appendChild(title);
    header.appendChild(rotateLabel);

    const img = document.createElement('img');
    img.className = 'pdfPages-thumb';
    img.src = pageState.thumb;
    if (pageState.rotation) {
      img.style.transform = `rotate(${pageState.rotation}deg)`;
    }

    const actionsRow = document.createElement('div');
    actionsRow.className = 'pdfPages-actionsRow';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'flex gap-xs';

    const upBtn = document.createElement('button');
    upBtn.className = 'icon-btn';
    upBtn.textContent = '↑';
    upBtn.disabled = idx === 0;
    upBtn.onclick = () => movePdfPage(idx, idx - 1);

    const downBtn = document.createElement('button');
    downBtn.className = 'icon-btn';
    downBtn.textContent = '↓';
    downBtn.disabled = idx === pdfPagesState.length - 1;
    downBtn.onclick = () => movePdfPage(idx, idx + 1);

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.textContent = '✕';
    delBtn.onclick = () => deletePdfPage(idx);

    leftGroup.appendChild(upBtn);
    leftGroup.appendChild(downBtn);
    leftGroup.appendChild(delBtn);

    const rightGroup = document.createElement('div');
    rightGroup.className = 'flex gap-xs';

    const rotateLeftBtn = document.createElement('button');
    rotateLeftBtn.className = 'icon-btn';
    rotateLeftBtn.textContent = '⟲';
    rotateLeftBtn.title = 'Rotate -90°';
    rotateLeftBtn.onclick = () => rotatePdfPage(idx, -90);

    const rotateRightBtn = document.createElement('button');
    rotateRightBtn.className = 'icon-btn';
    rotateRightBtn.textContent = '⟳';
    rotateRightBtn.title = 'Rotate +90°';
    rotateRightBtn.onclick = () => rotatePdfPage(idx, 90);

    rightGroup.appendChild(rotateLeftBtn);
    rightGroup.appendChild(rotateRightBtn);

    actionsRow.appendChild(leftGroup);
    actionsRow.appendChild(rightGroup);

    card.appendChild(header);
    card.appendChild(img);
    card.appendChild(actionsRow);

    grid.appendChild(card);
  });

  if (label) {
    label.textContent = `${pdfPagesState.length} page(s) in editor`;
  }
}

function movePdfPage(fromIdx, toIdx) {
  if (toIdx < 0 || toIdx >= pdfPagesState.length) return;
  const item = pdfPagesState.splice(fromIdx, 1)[0];
  pdfPagesState.splice(toIdx, 0, item);
  renderPdfPagesThumbs();
}

function deletePdfPage(idx) {
  pdfPagesState.splice(idx, 1);
  renderPdfPagesThumbs();
}

function rotatePdfPage(idx, delta) {
  const p = pdfPagesState[idx];
  if (!p) return;
  let newRotation = ((p.rotation || 0) + delta) % 360;
  if (newRotation < 0) newRotation += 360;
  p.rotation = newRotation;
  renderPdfPagesThumbs();
}

function parsePdfPagesRanges(input, maxPage) {
  const tokens = (input || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const selected = [];
  const used = new Set();

  for (const token of tokens) {
    let m;

    if (/^\d+$/.test(token)) {
      const n = parseInt(token, 10);
      if (n >= 1 && n <= maxPage && !used.has(n)) {
        used.add(n);
        selected.push(n);
      }
    } else if ((m = token.match(/^(\d+)\s*-\s*(\d+)$/))) {
      let start = parseInt(m[1], 10);
      let end = parseInt(m[2], 10);
      if (isNaN(start) || isNaN(end)) continue;
      if (start > end) {
        const tmp = start;
        start = end;
        end = tmp;
      }
      for (let n = start; n <= end; n++) {
        if (n >= 1 && n <= maxPage && !used.has(n)) {
          used.add(n);
          selected.push(n);
        }
      }
    }
  }
  return selected;
}

async function handlePdfPagesSplit() {
  const status = document.getElementById('pdfPages-split-status');
  if (!status) return;

  status.textContent = '';
  status.className = 'status';

  if (!pdfPagesOriginalBytes || !pdfPagesState.length) {
    status.textContent = 'Please upload a PDF first.';
    status.className = 'status error';
    return;
  }

  const rangeInput = document.getElementById('pdfPages-range').value.trim();
  if (!rangeInput) {
    status.textContent = 'Enter at least one page number or range.';
    status.className = 'status error';
    return;
  }

  const maxPage = pdfPagesState.length; // based on current edited order
  const selectedPositions = parsePdfPagesRanges(rangeInput, maxPage);

  if (!selectedPositions.length) {
    status.textContent = 'No valid page numbers found in your input.';
    status.className = 'status error';
    return;
  }

  status.textContent = 'Building split PDF...';
  try {
    const originalDoc = await PDFDocument.load(pdfPagesOriginalBytes);
    const splitDoc = await PDFDocument.create();

    for (const pos of selectedPositions) {
      const pageState = pdfPagesState[pos - 1]; // 1-based to 0-based
      if (!pageState) continue;

      const [copied] = await splitDoc.copyPages(originalDoc, [
        pageState.originalIndex
      ]);
      const page = copied;

      if (pageState.rotation) {
        page.setRotation(PDFLib.degrees(pageState.rotation));
      }

      splitDoc.addPage(page);
    }

    const bytes = await splitDoc.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    downloadBlob(blob, 'split-pages.pdf');

    status.textContent = `Done. Exported ${selectedPositions.length} page(s).`;
    status.className = 'status success';
  } catch (err) {
    console.error(err);
    status.textContent = 'Split failed. PDF may be too large or complex.';
    status.className = 'status error';
  }
}

async function handlePdfPagesDownloadEdited() {
  const editorStatus = document.getElementById('pdfPages-editor-status');
  if (!editorStatus) return;

  editorStatus.textContent = '';
  editorStatus.className = 'status';

  if (!pdfPagesOriginalBytes || !pdfPagesState.length) {
    editorStatus.textContent =
      'Upload a PDF and keep at least one page in the editor.';
    editorStatus.className = 'status error';
    return;
  }

  editorStatus.textContent = 'Building edited PDF...';

  try {
    const originalDoc = await PDFDocument.load(pdfPagesOriginalBytes);
    const outDoc = await PDFDocument.create();

    for (const p of pdfPagesState) {
      const [copied] = await outDoc.copyPages(originalDoc, [p.originalIndex]);
      const page = copied;
      if (p.rotation) {
        page.setRotation(PDFLib.degrees(p.rotation));
      }
      outDoc.addPage(page);
    }

    const bytes = await outDoc.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    downloadBlob(blob, 'edited-document.pdf');

    editorStatus.textContent = `Done. Exported ${pdfPagesState.length} page(s).`;
    editorStatus.className = 'status success';
  } catch (err) {
    console.error(err);
    editorStatus.textContent =
      'Export failed. PDF may be too large or complex for this device.';
    editorStatus.className = 'status error';
  }
}

// ---------- THEME SWITCHING ----------
// Light/Dark Mode Toggle
function toggleTheme() {
  const current = document.body.getAttribute('data-theme') || 'dark';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', newTheme);
  document.body.classList.toggle('day-mode');
  
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.textContent = newTheme === 'light' ? '🌙' : '☀️';
  }
  
  localStorage.setItem('site-light-dark-mode', newTheme);
}

// Color Theme Management
const colorThemeSelect = document.getElementById('color-theme-selector');

function applyColorTheme(colorTheme) {
  if (colorTheme === 'normal') {
    document.body.removeAttribute('data-color-theme');
    localStorage.removeItem('site-color-theme');
  } else {
    document.body.setAttribute('data-color-theme', colorTheme);
    localStorage.setItem('site-color-theme', colorTheme);
  }
}

if (colorThemeSelect) {
  colorThemeSelect.addEventListener('change', e => {
    applyColorTheme(e.target.value);
  });
}

// Initialize themes on page load
window.addEventListener('DOMContentLoaded', () => {
  // Restore light/dark mode
  const savedLightDark = localStorage.getItem('site-light-dark-mode') || 'dark';
  document.body.setAttribute('data-theme', savedLightDark);
  
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.textContent = savedLightDark === 'light' ? '🌙' : '☀️';
  }
  
  if (savedLightDark === 'light') {
    document.body.classList.add('day-mode');
  } else {
    document.body.classList.remove('day-mode');
  }
  
  // Restore color theme
  const savedColorTheme = localStorage.getItem('site-color-theme') || 'normal';
  if (colorThemeSelect) {
    colorThemeSelect.value = savedColorTheme;
  }
  applyColorTheme(savedColorTheme);
});
