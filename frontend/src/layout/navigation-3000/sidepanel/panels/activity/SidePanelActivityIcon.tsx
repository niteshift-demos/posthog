import { useValues } from 'kea'

import { IconNotification } from '@posthog/icons'

import { IconWithCount } from 'lib/lemon-ui/icons'

import { sidePanelNotificationsLogic } from '~/layout/navigation-3000/sidepanel/panels/activity/sidePanelNotificationsLogic'

export const SidePanelActivityIcon = (props: { className?: string }): JSX.Element => {
    const { unreadCount } = useValues(sidePanelNotificationsLogic)

    return (
        <IconWithCount count={unreadCount} {...props}>
            <IconNotification />
        </IconWithCount>
    )
}
