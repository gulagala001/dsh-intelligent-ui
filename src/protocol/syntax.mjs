import { UIError, LIMITS } from '../runtime/limits.mjs';
const precedence = { 32:1,31:2,25:3,26:3,27:4,28:4,29:4,30:4,20:5,21:5,22:6,23:6,24:6 };
/** Verify complete consumption before OpenUI's deliberately tolerant expression parser. */
export function verifyExpression(input) {
  const tokens=input.filter(t=>t.t!==0&&t.t!==13);let i=0,operations=0;
  const error=()=>{throw new UIError('SYNTAX','交互表达式格式不正确');};
  const take=kind=>{if(tokens[i]?.t!==kind)error();return tokens[i++];};
  const expression=(min=0,depth=0)=>{
    if(depth>LIMITS.depth||++operations>LIMITS.tokens)throw new UIError('DEPTH','表达式过深');
    const token=tokens[i++];if(!token)error();
    if([14,15,10,11,12,18].includes(token.t)){}
    else if([16,17,35].includes(token.t)){
      if(tokens[i]?.t===1){i++;if(tokens[i]?.t!==2){for(;;){expression(0,depth+1);if(tokens[i]?.t!==7)break;i++;if(tokens[i]?.t===2)break;}}take(2);}
    }
    else if(token.t===33||token.t===21)expression(7,depth+1);
    else if(token.t===1){expression(0,depth+1);take(2);}
    else if(token.t===3){if(tokens[i]?.t!==4){for(;;){expression(0,depth+1);if(tokens[i]?.t!==7)break;i++;if(tokens[i]?.t===4)break;}}take(4);}
    else if(token.t===5){if(tokens[i]?.t!==6){for(;;){if(![14,15,16,17,18].includes(tokens[i]?.t))error();i++;take(8);expression(0,depth+1);if(tokens[i]?.t!==7)break;i++;if(tokens[i]?.t===6)break;}}take(6);}
    else error();
    for(;;){
      const type=tokens[i]?.t;
      if(type===19){i++;if(![14,15,16,17,18].includes(tokens[i]?.t))error();i++;continue;}
      if(type===3){i++;expression(0,depth+1);take(4);continue;}
      const p=precedence[type];if(p>min){i++;expression(p,depth+1);continue;}
      if(type===34&&min===0){i++;expression(0,depth+1);take(8);expression(0,depth+1);continue;}
      break;
    }
  };
  expression();if(i!==tokens.length)error();return input;
}
