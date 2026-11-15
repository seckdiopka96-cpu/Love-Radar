import {quotePreview,type QuoteKind} from "./message-quote";
type Props={author:string;kind:QuoteKind;content:string|null|undefined;onJump?:()=>void;variant?:"bubble"|"composer"};
export default function QuoteCard({author,kind,content,onJump,variant="bubble"}:Props){
 const body=<><strong className="lr-quote-author">{author}</strong><span className="lr-quote-text">{quotePreview(kind,content)}</span></>;
 return onJump?
  <button type="button" className={"lr-quote-card is-"+variant} onClick={onJump} aria-label={"Voir le message cité de "+author}>{body}</button>:
  <div className={"lr-quote-card is-"+variant}>{body}</div>;
}
