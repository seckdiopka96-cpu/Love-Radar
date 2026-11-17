/** Chat receipts are backed by a partner-device acknowledgement, not online presence. */
export type DeliveryReceipt="sent"|"delivered"|"read";

export function receiptState(createdAt:number,partnerReadAt=0,partnerDeliveredAt=0):DeliveryReceipt{
 if(partnerReadAt>=createdAt)return "read";
 if(partnerDeliveredAt>=createdAt)return "delivered";
 return "sent";
}
/** Two real ticks for delivery/read, single tick for server-confirmed sending. */
export function receiptGlyph(state:DeliveryReceipt):string{
 return state==="sent"?"✓":"✓✓";
}
export function receiptDisplayLabel(state:DeliveryReceipt):string{
 return state==="read"?"Lu":state==="delivered"?"Distribué":"Envoyé";
}
export function receiptAccessibleLabel(state:DeliveryReceipt):string{
 return state==="read"?"Lu par ton partenaire":state==="delivered"?"Distribué sur l’appareil du partenaire":"Envoyé au serveur";
}
