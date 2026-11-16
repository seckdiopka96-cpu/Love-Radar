/** Chat receipts are backed by a partner-device acknowledgement, not online presence. */
export type DeliveryReceipt="sent"|"delivered"|"read";

export function receiptState(createdAt:number,partnerReadAt=0,partnerDeliveredAt=0):DeliveryReceipt{
 if(partnerReadAt>=createdAt)return "read";
 if(partnerDeliveredAt>=createdAt)return "delivered";
 return "sent";
}
export function receiptGlyph(state:DeliveryReceipt):string{
 return state==="read"?"Vu":state==="delivered"?"✓✓":"✓";
}
export function receiptAccessibleLabel(state:DeliveryReceipt):string{
 return state==="read"?"Vu par ton partenaire":state==="delivered"?"Distribué":"Envoyé";
}
