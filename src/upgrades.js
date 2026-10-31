// v1.2 added the "Control scope" setting (default: whole show). Connections made
// before it were all pointed at a Producer page's port — keep them that way.
function addScopeKeepingPageBehaviour(context, props) {
	const config = props.config
	if (config && config.scope === undefined) {
		return { updatedConfig: { ...config, scope: 'page' }, updatedActions: [], updatedFeedbacks: [] }
	}
	return { updatedConfig: null, updatedActions: [], updatedFeedbacks: [] }
}

const UpgradeScripts = [addScopeKeepingPageBehaviour]

module.exports = { UpgradeScripts, addScopeKeepingPageBehaviour }
