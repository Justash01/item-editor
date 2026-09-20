import { Player, system } from '@minecraft/server';
import { CustomForm, DataDrivenScreenClosedReason } from '@minecraft/server-ui';
import { Result, fail, ok } from '../util/Result';

const BUSY_RETRY_TICKS = 200;

// Chat is still closing on the tick a command runs, so the first show() after
// /jstash:editor usually comes back UserBusy.
export async function open(
    screen: CustomForm,
    viewer: Player
): Promise<Result<DataDrivenScreenClosedReason>> {
    const deadline = system.currentTick + BUSY_RETRY_TICKS;

    for (;;) {
        const reason = await screen.show();

        if (reason !== DataDrivenScreenClosedReason.UserBusy) {
            return ok(reason);
        }
        if (system.currentTick >= deadline || !viewer.isValid) {
            return fail('Close whatever screen you have open, then try again.');
        }

        await system.waitTicks(5);
    }
}
