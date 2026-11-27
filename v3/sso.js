
/* ========================================
   PTS SMART SCHOOL V.3 : SSO CLIENT
   ผู้พัฒนาระบบ: นายหุสนัน เจ๊ะเตะ ครูโรงเรียนบ้านปงตา
======================================== */
(function(){
  'use strict';
  /* ส่วนที่ 1 : ตั้งค่าระบบ V.3 */
  const GAS_API_URL='ใส่_URL_WEB_APP_ระบบลงเวลา_V3';
  const PORTAL_URL='/PTS/v3/portal/';
  const SESSION_KEY='PTS_V3_ATTENDANCE_SESSION';
  let current=null;
  let initializing=null;
  /* ส่วนที่ 2 : อ่าน Session ภายในแท็บ */
  function readSession(){
    try{
      const session=JSON.parse(
        sessionStorage.getItem(SESSION_KEY)||'null'
      );
      if(!session||
         !/^[a-f0-9]{64}$/.test(session.token||'')||
         !session.teacherName||
         !Number.isFinite(session.expiresAt)||
         Date.now()>=session.expiresAt){
        return null;
      }
      return session;
    }catch(e){
      return null;
    }
  }
  /* ส่วนที่ 3 : จัดเก็บ Session */
  function saveSession(data){
    if(!data||
       !/^[a-f0-9]{64}$/.test(data.token||'')||
       !data.teacherName||
       !Number.isFinite(data.expiresAt)||
       data.expiresAt<=Date.now()){
      throw Error('ข้อมูล Session ไม่ถูกต้อง');
    }
    current={
      token:data.token,
      teacherName:data.teacherName,
      expiresAt:data.expiresAt
    };
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify(current)
    );
    return current;
  }
  /* ส่วนที่ 4 : ล้าง Session ภายในอุปกรณ์ */
  function clearSession(){
    current=null;
    try{
      sessionStorage.removeItem(SESSION_KEY);
    }catch(e){}
  }
  /* ส่วนที่ 5 : ติดต่อ API ของระบบลงเวลา V.3 */
  async function request(payload){
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(GAS_API_URL)){
      throw Error('ยังไม่ได้ตั้งค่า URL ของระบบลงเวลา V.3');
    }
    const response=await fetch(GAS_API_URL,{
      method:'POST',
      redirect:'follow',
      credentials:'omit',
      cache:'no-store',
      referrerPolicy:'no-referrer',
      headers:{
        'Content-Type':'text/plain;charset=utf-8'
      },
      body:JSON.stringify(payload)
    });
    if(!response.ok){
      throw Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์');
    }
    const result=await response.json();
    if(!result||result.success!==true){
      const error=Error(
        result&&result.message||
        'ระบบปฏิเสธคำขอ'
      );
      error.code=result&&result.code||'';
      throw error;
    }
    return result;
  }
  /* ส่วนที่ 6 : อ่าน Ticket และลบออกจาก URL ทันที */
  function takeTicket(){
    const params=new URLSearchParams(
      location.hash.slice(1)
    );
    if(!params.has('ticket'))return '';
    const ticket=params.get('ticket')||'';
    history.replaceState(
      null,'',location.pathname+location.search
    );
    if(!/^[a-f0-9]{64}$/.test(ticket)){
      throw Error('SSO Ticket ไม่ถูกต้อง');
    }
    return ticket;
  }
  /* ส่วนที่ 7 : แลก Ticket และคืนค่า Session */
  async function initialize(){
    try{
      const ticket=takeTicket();
      if(ticket){
        // ยกเลิก Session เดิมก่อนรับสิทธิ์ใหม่
        const previous=current||readSession();
        clearSession();
        if(previous){
          await request({
            action:'ssoLogout',
            sessionToken:previous.token
          });
        }
        const result=await request({
          action:'ssoExchange',
          ticket:ticket
        });
        saveSession(result);
        return current;
      }
      const saved=readSession();
      if(!saved){
        clearSession();
        return null;
      }
      // ตรวจสอบ Session กับเซิร์ฟเวอร์
      const verified=await request({
        action:'ssoValidate',
        sessionToken:saved.token
      });
      saveSession({
        token:saved.token,
        teacherName:verified.teacherName,
        expiresAt:verified.expiresAt
      });
      return current;
    }catch(e){
      clearSession();
      throw e;
    }
  }
  /* ส่วนที่ 8 : ป้องกันการเริ่มต้น SSO ซ้ำ */
  function init(){
    if(initializing)return initializing;
    initializing=initialize().finally(()=>{
      initializing=null;
    });
    return initializing;
  }
  /* ส่วนที่ 9 : ตรวจสอบ Session ปัจจุบัน */
  function getSession(){
    if(!current||
       Date.now()>=current.expiresAt){
      clearSession();
      return null;
    }
    return {
      teacherName:current.teacherName,
      expiresAt:current.expiresAt
    };
  }
  /* ส่วนที่ 10 : ส่งคำขอพร้อม SSO Session */
  async function post(payload){
    if(initializing)await initializing;
    if(!getSession()){
      const error=Error(
        'กรุณาเข้าสู่ระบบผ่าน PTS Portal V.3'
      );
      error.code='SSO_REQUIRED';
      throw error;
    }
    try{
      return await request({
        ...payload,
        sessionToken:current.token
      });
    }catch(e){
      if(e.code==='SSO_REQUIRED'){
        clearSession();
      }
      throw e;
    }
  }
  /* ส่วนที่ 11 : เปิดหน้า Portal */
  function openPortal(){
    location.href=PORTAL_URL;
  }
  /* ส่วนที่ 12 : ออกจากระบบลงเวลา */
  async function logout(){
    const saved=current||readSession();
    clearSession();
    if(saved){
      return request({
        action:'ssoLogout',
        sessionToken:saved.token
      });
    }
    return {success:true};
  }
  /* ส่วนที่ 13 : เปิดฟังก์ชันส่วนกลาง */
  window.PTSSSO=Object.freeze({
    init,
    post,
    getSession,
    openPortal,
    logout
  });
})();

