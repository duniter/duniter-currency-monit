module.exports = function timestampToDatetime(timestamp) {
  // Convertir le timestamp en datetime
  let tmptimestampExpireCertif = new Date(timestamp*1000);//tmpQueryGetTimeWrittenCert[0].medianTime)*1000);
  let tmptimestampExpireCertifDay = tmptimestampExpireCertif.getDate();
  if (tmptimestampExpireCertifDay < 10 ) { tmptimestampExpireCertifDay = "0"+tmptimestampExpireCertifDay; }
  let tmptimestampExpireCertifMonth = tmptimestampExpireCertif.getMonth()+1;
  if (tmptimestampExpireCertifMonth < 10 ) { tmptimestampExpireCertifMonth = "0"+tmptimestampExpireCertifMonth; }
  
  // Formater les heures et minutes
  let tmptimestampExpireCertifhours = tmptimestampExpireCertif.getHours();
  if (tmptimestampExpireCertifhours < 10 ) { tmptimestampExpireCertifhours = "0"+tmptimestampExpireCertifhours; }
  let tmptimestampExpireCertifMinutes = tmptimestampExpireCertif.getMinutes();
  if (tmptimestampExpireCertifMinutes < 10 ) { tmptimestampExpireCertifMinutes = "0"+tmptimestampExpireCertifMinutes; }
  //let tmptimestampExpireCertifSeconds = tmptimestampExpireCertif.getSeconds();
  //if (tmptimestampExpireCertifSeconds < 10 ) { tmptimestampExpireCertifSeconds = "0"+tmptimestampExpireCertifSeconds; }

  var stringDateTime = tmptimestampExpireCertifDay+"/"+tmptimestampExpireCertifMonth+"/"+(tmptimestampExpireCertif.getFullYear()).toString().substring(2, 4)+" "
        +tmptimestampExpireCertifhours+":"+tmptimestampExpireCertifMinutes;//+":"+tmptimestampExpireCertifSeconds;
        
  return stringDateTime;
}