
/* ========================================
   PTS SMART SCHOOL : BIOMETRIC CORE
   ระบบลงเวลาด่วน โรงเรียนบ้านปงตา
======================================== */
(function(){
  'use strict';
  // ส่วนที่ 1 : กำหนดชื่อ Storage ของระบบเดิม
  const STORAGE_KEY='PTS_WEBAUTHN_DEVICE_V1';
  // ส่วนที่ 2 : อ่านข้อมูลอุปกรณ์ที่ลงทะเบียนไว้
  function getSavedCredential(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      return raw?JSON.parse(raw):null;
    }catch(e){
      return null;
    }
  }
  // ส่วนที่ 3 : ตรวจสอบข้อมูลการลงทะเบียนอุปกรณ์
  function hasRegisteredDevice(){
    const saved=getSavedCredential();
    return Boolean(saved&&saved.name&&saved.credentialId);
  }
  // ส่วนที่ 4 : ตรวจสอบการรองรับ WebAuthn
  function isSupported(){
    return Boolean(
      window.isSecureContext&&
      window.PublicKeyCredential&&
      navigator.credentials&&
      typeof navigator.credentials.get==='function'
    );
  }
  // ส่วนที่ 5 : จัดรูปแบบวันที่ของอุปกรณ์
  function localDateString(d=new Date()){
    const year=d.getFullYear();
    const month=String(d.getMonth()+1).padStart(2,'0');
    const day=String(d.getDate()).padStart(2,'0');
    return [year,month,day].join('-');
  }
  // ส่วนที่ 6 : ตรวจสอบความพร้อมของระบบ
  function checkReadiness(){
    return {
      supported:isSupported(),
      registered:hasRegisteredDevice(),
      gpsSupported:Boolean(navigator.geolocation)
    };
  }
  // ส่วนที่ 7 : เปิดหน้าระบบลงเวลาเดิม
  function openAttendance(){
    window.location.href='/PTS/v2/attendance/';
  }
  // ส่วนที่ 8 : เปิดให้หน้าแรกเรียกใช้ฟังก์ชันร่วม
  window.PTSBiometric=Object.freeze({
    getSavedCredential,
    hasRegisteredDevice,
    isSupported,
    localDateString,
    checkReadiness,
    openAttendance
  });
})();
/* ผู้พัฒนาระบบ: นายหุสนัน เจ๊ะเตะ ครูโรงเรียนบ้านปงตา */
