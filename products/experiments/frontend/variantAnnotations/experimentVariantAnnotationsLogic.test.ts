import { MOCK_DEFAULT_ORGANIZATION_MEMBER, MOCK_SECOND_ORGANIZATION_MEMBER } from 'lib/api.mock'

import { expectLogic } from 'kea-test-utils'

import { membersLogic } from 'scenes/organization/membersLogic'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { experimentVariantAnnotationsLogic } from './experimentVariantAnnotationsLogic'

describe('experiment variant annotation mentions', () => {
    beforeEach(() => {
        useMocks({
            get: {
                '/api/organizations/:organization/members/': {
                    count: 2,
                    next: null,
                    results: [MOCK_DEFAULT_ORGANIZATION_MEMBER, MOCK_SECOND_ORGANIZATION_MEMBER],
                },
                '/api/projects/:project/experiments/:experiment/variant_annotations/': {
                    count: 0,
                    next: null,
                    results: [],
                },
            },
        })
        initKeaTests()
    })

    it('loads teammates for the mention picker when annotations mount on a fresh page', async () => {
        const logic = experimentVariantAnnotationsLogic({ experimentId: 3 })
        await expectLogic(membersLogic, () => logic.mount()).toFinishAllListeners()

        expect(membersLogic.values.meFirstMembers.map((member) => member.user.id)).toContain(
            MOCK_SECOND_ORGANIZATION_MEMBER.user.id
        )
    })
})
