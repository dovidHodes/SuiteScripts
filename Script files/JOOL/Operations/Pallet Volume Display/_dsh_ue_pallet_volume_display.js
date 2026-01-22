/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */

define([], () => {

    const beforeLoad = (context) => {
      if (context.type !== context.UserEventType.VIEW) return;
  
      const rec = context.newRecord;
  
      const percent = Number(rec.getValue({ fieldId: 'custrecord_percentage' })) || 0;
      const displayPercent = Math.round(percent);
  
      // Gradient color logic with 3D effect (lighter top, darker bottom)
      let gradient;
      if (percent >= 95) {
        gradient = 'linear-gradient(to bottom, #66e07f, #27ae60)'; // green 3D
      } else if (percent >= 90) {
        gradient = 'linear-gradient(to bottom, #6fb4ff, #2c80b4)'; // blue 3D
      } else if (percent >= 70) {
        gradient = 'linear-gradient(to bottom, #ffeb66, #d4ac0d)'; // yellow 3D
      } else {
        gradient = 'linear-gradient(to bottom, #ff6b6b, #c0392b)'; // red 3D
      }
  
      const html = `
        <div style="
          width:50%;
          background-color:#e0e0e0;
          border-radius:50px;
          height:25px;
          overflow:hidden;
          margin:10px auto;
          box-shadow: 0 6px 12px rgba(0,0,0,0.25); /* outer shadow for depth */
          position: relative;"
          title="Pallet volume utilized">
  
          <div style="
            width:${percent}%;
            background:${gradient};
            height:100%;
            display:flex;
            align-items:center;
            justify-content:center;
            color:#ffffff;
            font-weight:bold;
            font-size:12px;
            border-radius:50px;
            box-shadow: 0 3px 6px rgba(0,0,0,0.3); /* inner subtle shadow for lift */
            position: relative;
            transition: width 0.4s ease;">
            ${displayPercent}% of pallet used
            
            <!-- Optional tiny highlight line at top -->
            <div style="
              position:absolute;
              top:2px;
              left:0;
              width:100%;
              height:3px;
              background: rgba(255,255,255,0.35);
              border-radius:50px 50px 0 0;
              pointer-events:none;">
            </div>
          </div>
        </div>
      `;
  
      rec.setValue({
        fieldId: 'custrecord18',
        value: html
      });
    };
  
    return { beforeLoad };
  
  });
  