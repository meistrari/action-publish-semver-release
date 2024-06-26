import { getExecOutput } from '@actions/exec'
import * as core from '@actions/core'

export const getLastGitTag = async(options: {
    considerReleaseCandidates: boolean
    logInGroup?: boolean
}): Promise<string | null> => {
    try {
        if (options.logInGroup)
            core.startGroup('Getting last git tag')
        const { stdout: gitTagList, exitCode } = await getExecOutput(
            'git for-each-ref --sort=creatordate --format "%(refname)" refs/tags',
        )
        if (exitCode !== 0)
            throw Error
        const filteredTags = gitTagList
            .trim()
            .split('\n')
            .filter(ref =>
                // Ensure that the line isn't empty, then check against
                // the release candidate option input
                Boolean(ref)
                && ref.split('/').at(-1)?.match(/^v?\d+\.\d+\.\d+(-[\w\d]+)?$/) !== null
                && options.considerReleaseCandidates
                    ? true
                    : !ref.includes('-rc'),
            )
            .reverse()
        const lastGitTag = filteredTags
            .at(0)
            ?.split('/')
            .at(-1)

        if (lastGitTag === undefined || lastGitTag === '') {
            core.info('No git tag found.')
            throw Error
        }
        core.info(`Last git tag: ${lastGitTag}`)
        if (options.logInGroup)
            core.endGroup()
        return lastGitTag
    }
    catch (e) {
        core.error('Could not get last git tag')
        return null
    }
}

export const getLastCommitMessage = async(): Promise<string | null> => {
    try {
        core.startGroup('Getting last commit message')
        const { stdout: lastCommitMessage, exitCode } = await getExecOutput(
            'git log -1 --pretty=%B --no-merges',
        )
        if (exitCode !== 0)
            throw Error
        core.endGroup()
        return lastCommitMessage
    }
    catch (e) {
        core.error('Could not get last commit message')
        return null
    }
}

const setGitCommiter = async(): Promise<void> => {
    try {
        const name = core.getInput('git-committer-name')
        const email = core.getInput('git-committer-email')
        core.startGroup('Setting git committer identity')
        core.info(`Using ${name} <${email}>`)
        if (name === '' || email === '')
            throw new Error('Git committer name and email are required')

        const { exitCode: exitCodeName } = await getExecOutput(
            `git config --global user.name "${name}"`,
            [],
            { silent: true },
        )
        if (exitCodeName !== 0)
            throw new Error('Could not set git committer name')

        const { exitCode: exitCodeEmail } = await getExecOutput(
            `git config --global user.email "${email}"`,
            [],
            { silent: true },
        )
        if (exitCodeEmail !== 0)
            throw new Error('Could not set git committer email')

        core.info('Git committer identity set.')
        core.endGroup()
    }
    catch (e: any) {
        core.error(`Could not set git committer identity\n${e.message}`)
    }
}

export const tagCommit = async(nextVersion: string, isReleaseCandidate: boolean): Promise<void | null> => {
    try {
        await setGitCommiter()
        core.startGroup(`Tagging ${isReleaseCandidate ? 'release candidate' : 'version'} ${nextVersion}`)
        const version = `${nextVersion}${isReleaseCandidate ? '-rc' : ''}`
        const { exitCode: tagExitCode } = await getExecOutput(
            `git tag -a ${version} -m "Release ${nextVersion}"`,
        )
        if (tagExitCode !== 0)
            throw Error

        const { exitCode: pushExitCode } = await getExecOutput(
            'git push --tags',
        )
        if (pushExitCode !== 0)
            throw Error
        core.info(`Git tag ${version} pushed.`)
        core.endGroup()
    }
    catch (e) {
        core.error('Could not tag commit')
        return null
    }
}

export const deleteTag = async(tag: string): Promise<void | null> => {
    try {
        core.startGroup('Deleting tag')
        const { exitCode: deleteTagExitCode } = await getExecOutput(
            `git tag -d ${tag}`,
        )
        if (deleteTagExitCode !== 0)
            throw Error

        const { exitCode: pushExitCode } = await getExecOutput(
            `git push --delete origin ${tag}`,
        )
        if (pushExitCode !== 0)
            throw Error
        core.info(`Git tag ${tag} deleted.`)
        core.endGroup()
    }
    catch (e) {
        core.error('Could not delete tag')
        return null
    }
}
