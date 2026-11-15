/**
 * Explicit consent is required from BOTH partners before a reconciliation
 * statement becomes visible to the other. Draft text never crosses this
 * boundary, regardless of whether a partner is online.
 */
export type ReconciliationTexts={pain:string;needs:string;message:string};
export const MAX_RECONCILIATION_TEXT={pain:16000,needs:5000,message:5000} as const;
export function readReconciliationTexts(input:Record<string,unknown>):ReconciliationTexts|null{
 if(typeof input.pain!=="string"||typeof input.needs!=="string"||typeof input.message!=="string")return null;
 if(input.pain.length>MAX_RECONCILIATION_TEXT.pain||
    input.needs.length>MAX_RECONCILIATION_TEXT.needs||
    input.message.length>MAX_RECONCILIATION_TEXT.message)return null;
 return {pain:input.pain,needs:input.needs,message:input.message};
}
export function hasReconciliationMessage(value:ReconciliationTexts):boolean{
 return value.pain.trim().length>0||value.needs.trim().length>0||value.message.trim().length>0;
}
export function canRevealReconciliation(status:string,mySubmitted:boolean,partnerSubmitted:boolean):boolean{
 return status==="revealed"&&mySubmitted===true&&partnerSubmitted===true;
}
