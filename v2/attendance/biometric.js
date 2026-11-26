
/* ========================================
   PTS SMART SCHOOL : QUICK ATTENDANCE
   ระบบลงเวลาด่วนด้วย Biometric
   โรงเรียนบ้านปงตา
======================================== */
(function(){
  'use strict';
  // ส่วนที่ 1 : การตั้งค่าและ URL ของระบบลงเวลา
  const GAS_API_URL='https://script.google.com/macros/s/AKfycbzn2-JdsHmL6hcKnZ2C5DUNxTl-2EqJ4HIV6O9zudE8_ygtX6_bwvu8I-XFRJ4-I74k/exec';
  const STORAGE_KEY='PTS_WEBAUTHN_DEVICE_V1';
  const ATTENDANCE_URL='/PTS/v2/attendance/';
  let quickBusy=false,prepared=null,pending=null;
  // ส่วนที่ 2 : อ่านข้อมูลอุปกรณ์ที่ลงทะเบียนไว้
  function getSavedCredential(){
    try{
      return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    }catch(e){
      return null;
    }
  }
  // ตรวจสอบการลงทะเบียนอุปกรณ์
  function hasRegisteredDevice(){
    const s=getSavedCredential();
    return Boolean(s&&s.name&&s.credentialId);
  }
  // ตรวจสอบการรองรับ WebAuthn
  function isSupported(){
    return Boolean(window.isSecureContext&&window.PublicKeyCredential&&navigator.credentials&&typeof navigator.credentials.get==='function');
  }
  // จัดรูปแบบวันที่ตามเวลาประเทศไทย
  function localDateString(){
    const parts=new Intl.DateTimeFormat('en-CA',{
      timeZone:'Asia/Bangkok',
      year:'numeric',
      month:'2-digit',
      day:'2-digit'
    }).formatToParts(new Date());
    return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
  }
  // ตรวจสอบความพร้อมของระบบ
  function checkReadiness(){
    return {
      supported:isSupported(),
      registered:hasRegisteredDevice(),
      gpsSupported:Boolean(navigator.geolocation)
    };
  }
  // เปิดหน้าระบบลงเวลาเดิม
  function openAttendance(){
    window.location.href=ATTENDANCE_URL;
  }
  // ส่วนที่ 3 : ติดต่อ Google Apps Script
  async function post(payload){
    const res=await fetch(GAS_API_URL,{
      method:'POST',
      redirect:'follow',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(payload)
    });
    if(!res.ok){
      throw Error('เซิร์ฟเวอร์ไม่ตอบสนอง (HTTP '+res.status+')');
    }
    let data;
    try{
      data=await res.json();
    }catch(e){
      throw Error('ไม่สามารถอ่านผลจากเซิร์ฟเวอร์ กรุณาตรวจสอบการเผยแพร่ Web App');
    }
    if(!data.success){
      const e=Error(data.message||'เซิร์ฟเวอร์ปฏิเสธคำขอ');
      e.code=data.code||'';
      throw e;
    }
    return data;
  }
  // แปลง Base64URL เป็นข้อมูลสำหรับ WebAuthn
  function fromB64(s){
    let b=s.replace(/-/g,'+').replace(/_/g,'/');
    b+='='.repeat((4-b.length%4)%4);
    return Uint8Array.from(atob(b),x=>x.charCodeAt(0));
  }
  // แปลงข้อมูล WebAuthn เป็น Base64URL
  function toB64(b){
    let s='';
    for(const x of new Uint8Array(b)){
      s+=String.fromCharCode(x);
    }
    return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  // จัดเตรียมหลักฐานยืนยันตัวตน
  function encodeAssertion(a){
    if(!a||!a.response){
      throw Error('ไม่ได้รับผลยืนยันตัวตน');
    }
    return {
      id:toB64(a.rawId),
      clientDataJSON:toB64(a.response.clientDataJSON),
      authenticatorData:toB64(a.response.authenticatorData),
      signature:toB64(a.response.signature)
    };
  }
  // เรียกหน้าต่างสแกนลายนิ้วมือหรือ Face ID
  async function scan(challenge,credentialId){
    if(!isSupported()){
      throw Error('กรุณาเปิดผ่าน Chrome หรือ Safari ที่รองรับ WebAuthn');
    }
    const a=await navigator.credentials.get({
      publicKey:{
        challenge:fromB64(challenge),
        rpId:window.location.hostname,
        allowCredentials:[{
          type:'public-key',
          id:fromB64(credentialId),
          transports:['internal']
        }],
        userVerification:'required',
        timeout:60000
      }
    });
    return encodeAssertion(a);
  }
  // ส่วนที่ 4 : ลงทะเบียนอุปกรณ์ด้วย PIN เดิม
  async function enroll(name,pin,onStatus){
    if(!isSupported()){
      throw Error('อุปกรณ์ไม่รองรับ WebAuthn');
    }
    const notify=typeof onStatus==='function'?onStatus:()=>{};
    notify('กำลังตรวจสอบ PIN...');
    const r=await post({
      action:'qaEnrollBegin',
      employeeName:name,
      teacherPin:pin
    });
    notify('ยืนยันตัวตนเพื่อลงทะเบียนอุปกรณ์...');
    const cred=await navigator.credentials.create({
      publicKey:{
        challenge:fromB64(r.challenge),
        rp:{
          name:'โรงเรียนบ้านปงตา',
          id:window.location.hostname
        },
        user:{
          id:fromB64(r.userId),
          name:name,
          displayName:name
        },
        pubKeyCredParams:[
          {type:'public-key',alg:-7}
        ],
        authenticatorSelection:{
          authenticatorAttachment:'platform',
          userVerification:'required',
          residentKey:'preferred'
        },
        attestation:'none',
        timeout:60000
      }
    });
    if(!cred||!cred.response||typeof cred.response.getPublicKey!=='function'){
      throw Error('เบราว์เซอร์ไม่รองรับการอ่านกุญแจสาธารณะ กรุณาอัปเดตเบราว์เซอร์');
    }
    const key=cred.response.getPublicKey();
    if(!key){
      throw Error('ไม่ได้รับกุญแจสาธารณะจากอุปกรณ์');
    }
    const id=toB64(cred.rawId);
    notify('กรุณายืนยันตัวตนอีกครั้งเพื่อรับรองกุญแจใหม่...');
    const assertion=await scan(r.challenge,id);
    notify('กำลังบันทึกทะเบียนอุปกรณ์...');
    const result=await post({
      action:'qaEnrollFinish',
      challenge:r.challenge,
      credentialId:id,
      publicKey:toB64(key),
      assertion:assertion
    });
    localStorage.setItem(STORAGE_KEY,JSON.stringify({
      name:result.name,
      credentialId:result.credentialId,
      version:2
    }));
    prepared=null;
    return result;
  }
  // ส่วนที่ 5 : ตรวจสอบตำแหน่ง GPS
  function getLocation(){
    return new Promise((resolve,reject)=>{
      if(!navigator.geolocation){
        return reject(Error('อุปกรณ์ไม่รองรับ GPS'));
      }
      navigator.geolocation.getCurrentPosition(
        p=>resolve({
          latitude:p.coords.latitude,
          longitude:p.coords.longitude
        }),
        e=>reject(Error(({
          1:'กรุณาอนุญาตให้เว็บไซต์ใช้ GPS',
          2:'ไม่สามารถระบุตำแหน่งได้ กรุณาเปิด GPS',
          3:'ค้นหาตำแหน่งนานเกินไป'
        })[e.code]||'ไม่สามารถอ่าน GPS ได้')),
        {
          enableHighAccuracy:true,
          timeout:15000,
          maximumAge:0
        }
      );
    });
  }
  // ส่วนที่ 6 : เตรียมข้อมูลลงเวลาด่วน
  function quickData(){
    const s=getSavedCredential();
    if(!s||!s.name||!s.credentialId){
      const e=Error('กรุณาลงทะเบียนอุปกรณ์ก่อน');
      e.code='REENROLL';
      throw e;
    }
    return {
      employeeName:s.name,
      credentialId:s.credentialId,
      entryType:'มาปฏิบัติงาน',
      customDate:localDateString()
    };
  }
  // สร้างกุญแจสำหรับตรวจสอบคำขอลงเวลา
  function quickKey(d){
    return JSON.stringify([
      d.employeeName,
      d.credentialId,
      d.entryType,
      d.customDate
    ]);
  }
  // เตรียม Challenge ล่วงหน้าเพื่อลดเวลารอ
  async function prime(){
    if(!isSupported()||!hasRegisteredDevice()||quickBusy)return;
    const data=quickData();
    const key=quickKey(data);
    if(prepared&&prepared.key===key&&Date.now()-prepared.at<90000)return;
    if(pending)return pending;
    pending=post({
      action:'qaBegin',
      data:data
    }).then(r=>{
      prepared={
        key:key,
        at:Date.now(),
        challenge:r.challenge
      };
    }).catch(()=>{
      prepared=null;
    }).finally(()=>{
      pending=null;
    });
    return pending;
  }
  // ส่วนที่ 7 : สแกน ตรวจสอบ GPS และส่งข้อมูลบันทึก
  async function submit(data,onStatus,challenge){
    const notify=typeof onStatus==='function'?onStatus:()=>{};
    if(!challenge){
      notify('กำลังเตรียมการยืนยันตัวตน...');
      challenge=(await post({
        action:'qaBegin',
        data:data
      })).challenge;
    }
    notify('กรุณายืนยันตัวตนบนโทรศัพท์...');
    const assertion=await scan(challenge,data.credentialId);
    let loc={latitude:null,longitude:null};
    if(data.entryType==='มาปฏิบัติงาน'){
      notify('กำลังตรวจสอบ GPS...');
      loc=await getLocation();
    }
    notify('กำลังบันทึกข้อมูล...');
    return post({
      action:'qaFinish',
      challenge:challenge,
      assertion:assertion,
      latitude:loc.latitude,
      longitude:loc.longitude
    });
  }
  // ส่วนที่ 8 : ฟังก์ชันลงเวลาด่วนจากหน้าแรก
  async function quickAttendance(onStatus){
    if(quickBusy){
      throw Error('กำลังดำเนินการ');
    }
    const data=quickData();
    const key=quickKey(data);
    quickBusy=true;
    try{
      let challenge=null;
      if(prepared&&prepared.key===key&&Date.now()-prepared.at<90000){
        challenge=prepared.challenge;
        prepared=null;
      }
      return await submit(data,onStatus,challenge);
    }finally{
      quickBusy=false;
      prepared=null;
      prime();
    }
  }
  // ส่วนที่ 9 : เปิดฟังก์ชันให้หน้าแรกและระบบเดิมเรียกใช้งาน
  window.PTSBiometric=Object.freeze({
    GAS_API_URL,
    getSavedCredential,
    hasRegisteredDevice,
    isSupported,
    localDateString,
    checkReadiness,
    openAttendance,
    prime,
    enroll,
    submit,
    quickAttendance
  });
})();
/* ผู้พัฒนาระบบ: นายหุสนัน เจ๊ะเตะ ครูโรงเรียนบ้านปงตา */
